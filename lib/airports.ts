import airportsData from './data/airports.json';
import type { PlaceSuggestion } from './places';

interface StaticAirport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

// Source: https://github.com/mwgg/Airports (MIT) — every public airport with an
// IATA code, so code/name/city search never depends on Google's fuzzy text match
// missing a valid code (e.g. Google Autocomplete not matching "CUN" by itself).
const AIRPORTS = airportsData as StaticAirport[];
const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]));

const IATA_PLACE_ID_PREFIX = 'iata:';
const MAX_RESULTS = 8;

const countryNames = new Map<string, string>();
function countryName(iso2: string): string {
  let name = countryNames.get(iso2);
  if (name === undefined) {
    try {
      name = new Intl.DisplayNames(['en'], { type: 'region' }).of(iso2) ?? iso2;
    } catch {
      name = iso2;
    }
    countryNames.set(iso2, name);
  }
  return name;
}

function describe(a: StaticAirport): string {
  return `${a.name} (${a.iata}), ${a.city}, ${countryName(a.country)}`;
}

function toSuggestion(a: StaticAirport): PlaceSuggestion {
  return { placeId: `${IATA_PLACE_ID_PREFIX}${a.iata}`, description: describe(a) };
}

/**
 * Matches an IATA code, airport name, or city against the bundled airport list.
 * Exact code matches rank first, then code/city/name prefix matches, then substring hits.
 */
export function searchAirports(rawInput: string): PlaceSuggestion[] {
  const input = rawInput.trim().toLowerCase();
  if (!input) return [];

  const exact = input.length === 3 ? BY_IATA.get(input.toUpperCase()) : undefined;

  const ranked: { airport: StaticAirport; rank: number }[] = [];
  for (const a of AIRPORTS) {
    if (a === exact) continue;
    const iata = a.iata.toLowerCase();
    const city = a.city.toLowerCase();
    const name = a.name.toLowerCase();

    let rank: number;
    if (iata.startsWith(input)) rank = 0;
    else if (city.startsWith(input)) rank = 1;
    else if (name.startsWith(input)) rank = 2;
    else if (city.includes(input) || name.includes(input)) rank = 3;
    else continue;

    ranked.push({ airport: a, rank });
  }
  ranked.sort((x, y) => x.rank - y.rank || x.airport.name.localeCompare(y.airport.name));

  const ordered = exact ? [exact, ...ranked.map((r) => r.airport)] : ranked.map((r) => r.airport);
  return ordered.slice(0, MAX_RESULTS).map(toSuggestion);
}

export function getStaticAirport(placeId: string): StaticAirport | undefined {
  if (!placeId.startsWith(IATA_PLACE_ID_PREFIX)) return undefined;
  return BY_IATA.get(placeId.slice(IATA_PLACE_ID_PREFIX.length));
}
