import { redis } from './redis';
import { isEnabled } from './feature-flags';
import { CACHE, cacheKeys } from './cache-config';
import { searchAirports, getStaticAirport } from './airports';

const GMAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

export interface PlaceLatLng {
  latitude: number;
  longitude: number;
  name: string;
}

interface RawPrediction {
  place_id: string;
  description: string;
  types?: string[];
}

/**
 * Shared fetch behind Places Autocomplete. Callers that only need {placeId, description}
 * should use getPlaceAutocomplete below; resolveCountryIso2 also needs the raw `types`
 * array (to detect a country prediction), so it calls this directly.
 */
async function fetchAutocompletePredictions(
  input: string,
  sessionToken: string,
  types?: string,
  components?: string,
): Promise<RawPrediction[]> {
  if (!GMAPS_KEY) throw new Error('GOOGLE_MAPS_API_KEY is not set');

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', input);
  url.searchParams.set('sessiontoken', sessionToken);
  if (types) url.searchParams.set('types', types);
  if (components) url.searchParams.set('components', components);
  url.searchParams.set('key', GMAPS_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places autocomplete failed: ${data.status}`);
  }

  return data.predictions ?? [];
}

/**
 * Calls Places Autocomplete API.
 * All autocomplete calls in a session share the same sessionToken — they are free.
 * Only the final Place Details call (getPlaceLatLng) is billed.
 */
export async function getPlaceAutocomplete(
  input: string,
  sessionToken: string,
  types?: string,
  components?: string,
): Promise<PlaceSuggestion[]> {
  const predictions = await fetchAutocompletePredictions(input, sessionToken, types, components);
  return predictions.map((p) => ({ placeId: p.place_id, description: p.description }));
}

/**
 * Resolves free text to an ISO-3166-1 alpha-2 country code, if it names a country.
 * Used as a fallback when an airport-restricted search finds nothing — e.g. "Japan"
 * doesn't match any airport's name directly. Uses its own session token so this
 * detection doesn't end the caller's billing session.
 */
async function resolveCountryIso2(input: string): Promise<string | null> {
  if (!GMAPS_KEY) throw new Error('GOOGLE_MAPS_API_KEY is not set');
  const sessionToken = crypto.randomUUID();

  const predictions = await fetchAutocompletePredictions(input, sessionToken, '(regions)');
  const top = predictions[0];
  if (!top || !top.types?.includes('country')) return null;

  const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  detailsUrl.searchParams.set('place_id', top.place_id);
  detailsUrl.searchParams.set('fields', 'address_component');
  detailsUrl.searchParams.set('sessiontoken', sessionToken);
  detailsUrl.searchParams.set('key', GMAPS_KEY);

  const detailsRes = await fetch(detailsUrl.toString());
  const detailsData = await detailsRes.json();
  if (detailsData.status !== 'OK') return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countryComponent = (detailsData.result?.address_components ?? []).find((c: any) =>
    c.types?.includes('country'),
  );
  return countryComponent?.short_name ?? null;
}

/**
 * Returns Google's top public airports (with IATA codes) for a country.
 * Cached in Redis for 24h — airport lists per country are effectively static.
 */
async function getAirportsInCountry(iso2: string): Promise<PlaceSuggestion[]> {
  const cacheKey = cacheKeys.countryAirports(iso2);

  if (isEnabled("integration:redis:places")) {
    try {
      const cached = await redis.get<PlaceSuggestion[]>(cacheKey);
      if (cached) return cached;
    } catch (err) {
      console.warn('[places] Redis read failed, falling through to Places API:', err);
    }
  }

  const sessionToken = crypto.randomUUID();
  const result = await getPlaceAutocomplete('airport', sessionToken, 'airport', `country:${iso2}`);

  if (isEnabled("integration:redis:places")) {
    try {
      await redis.set(cacheKey, result, { ex: CACHE.countryAirports.ttl });
    } catch (err) {
      console.warn('[places] Redis write failed:', err);
    }
  }

  return result;
}

/**
 * Airport-mode autocomplete: matches the bundled public-airport list first (every
 * IATA code, so a bare code like "CUN" always resolves even when Google's fuzzy
 * text match on the airport name wouldn't surface it). Falls through to Google only
 * when nothing local matches — a direct name search, then a country-name search
 * (e.g. "Japan" → NRT, HND, KIX, ...).
 */
export async function getAirportsForQuery(input: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  const staticMatches = searchAirports(input);
  if (staticMatches.length > 0) return staticMatches;

  if (!isEnabled("integration:google-places:places")) return [];

  const direct = await getPlaceAutocomplete(input, sessionToken, 'airport');
  if (direct.length > 0) return direct;

  const iso2 = await resolveCountryIso2(input);
  if (!iso2) return [];

  return getAirportsInCountry(iso2);
}

export interface NearestAirport extends PlaceLatLng {
  description: string;
  iataCode: string | undefined;
}

/**
 * Returns the most relevant airport for a given city name.
 * Uses Places Autocomplete with "airport" appended, picks the first result
 * that contains an IATA code, then resolves its lat/lng via Place Details.
 */
export async function getNearestAirport(cityName: string): Promise<NearestAirport> {
  const sessionToken = crypto.randomUUID();
  // Use only the primary city name (before the first comma) so autocomplete gets a clean,
  // short query — e.g. "Washington D.C., DC, USA" → "Washington D.C. airport"
  const cityShort = cityName.split(',')[0].trim();
  let suggestions = await getPlaceAutocomplete(`${cityShort} airport`, sessionToken, 'airport');

  // If no results, retry with first word only (e.g. "Washington airport")
  if (suggestions.length === 0) {
    const firstWord = cityShort.split(' ')[0];
    suggestions = await getPlaceAutocomplete(`${firstWord} airport`, sessionToken, 'airport');
  }

  // Prefer results that include an IATA code in the description
  const withIata = suggestions.filter((s) => /\([A-Z]{3}\)/.test(s.description));
  const chosen = withIata[0] ?? suggestions[0];
  if (!chosen) throw new Error(`No airport found for "${cityName}"`);

  const iataMatch = chosen.description.match(/\(([A-Z]{3})\)/);
  const iataCode = iataMatch?.[1];

  const latLng = await getPlaceLatLng(chosen.placeId, sessionToken);
  return { ...latLng, description: chosen.description, iataCode };
}

/**
 * Returns a photo_reference for a place identified by name + address.
 * The caller should construct a server-side proxy URL from this reference
 * (e.g. /api/place-photo?ref=REFERENCE) so the API key is never exposed.
 * Results are cached in Redis for 7 days.
 */
export async function getPlacePhoto(name: string, address: string): Promise<string | null> {
  if (!GMAPS_KEY) return null;

  const cacheKey = cacheKeys.placePhoto(name, address);

  if (isEnabled("integration:redis:places")) {
    try {
      const cached = await redis.get<string>(cacheKey);
      if (cached) return cached;
    } catch {
      // Redis unavailable — fall through to live API
    }
  }

  const findUrl = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
  findUrl.searchParams.set('input', `${name} ${address}`);
  findUrl.searchParams.set('inputtype', 'textquery');
  findUrl.searchParams.set('fields', 'photos');
  findUrl.searchParams.set('key', GMAPS_KEY);

  const findRes = await fetch(findUrl.toString());
  const findData = await findRes.json();

  const photoRef: string | undefined = findData.candidates?.[0]?.photos?.[0]?.photo_reference;
  if (!photoRef) return null;

  if (isEnabled("integration:redis:places")) {
    try {
      await redis.set(cacheKey, photoRef, { ex: CACHE.placePhoto.ttl });
    } catch {
      // Redis unavailable — still return the result
    }
  }

  return photoRef;
}

/**
 * Returns lat/lng for a placeId.
 * Results are cached in Redis by placeId for 30 days — coordinates don't change,
 * so any user resolving the same place hits the cache, not the API.
 * Passing the sessionToken ends the billing session (this is the only billed call).
 */
export async function getPlaceLatLng(
  placeId: string,
  sessionToken: string,
): Promise<PlaceLatLng> {
  // Bundled airport pick — coordinates come from the static list, no Google call needed.
  const staticAirport = getStaticAirport(placeId);
  if (staticAirport) {
    return { latitude: staticAirport.lat, longitude: staticAirport.lon, name: staticAirport.name };
  }

  const cacheKey = cacheKeys.placeLatLng(placeId);

  // Cache hit — Redis failure is non-fatal; fall through to live API
  if (isEnabled("integration:redis:places")) {
    try {
      const cached = await redis.get<PlaceLatLng>(cacheKey);
      if (cached) return cached;
    } catch (err) {
      console.warn('[places] Redis read failed, falling through to Places API:', err);
    }
  }

  // Cache miss → call Place Details (this call closes the session and is billed)
  if (!GMAPS_KEY) throw new Error('GOOGLE_MAPS_API_KEY is not set');

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'geometry,name');
  url.searchParams.set('sessiontoken', sessionToken);
  url.searchParams.set('key', GMAPS_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== 'OK') {
    console.error('[places] Place Details failed', { placeId, status: data.status, error_message: data.error_message });
    throw new Error(`Place details failed: ${data.status}`);
  }

  const { lat, lng } = data.result.geometry.location;
  const result: PlaceLatLng = { latitude: lat, longitude: lng, name: data.result.name };

  // 30-day TTL — swallow write errors so the result is still returned
  if (isEnabled("integration:redis:places")) {
    try {
      await redis.set(cacheKey, result, { ex: CACHE.placeLatLng.ttl });
    } catch (err) {
      console.warn('[places] Redis write failed:', err);
    }
  }

  return result;
}
