import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { flaggedProcedure, router } from '@/server/trpc';
import { isEnabled } from '@/lib/feature-flags';
import { getPlaceAutocomplete, getAirportsForQuery, getPlaceLatLng, getNearestAirport, getPlacePhoto } from '@/lib/places';

export const placesRouter = router({
  /**
   * Autocomplete — free when called with a sessionToken.
   * The token groups all autocomplete calls in a session; only Place Details is billed.
   */
  autocomplete: flaggedProcedure("api:places")
    .input(z.object({
      input: z.string().min(1),
      sessionToken: z.string().uuid(),
      types: z.string().optional(),
    }))
    .query(async ({ input: { input, sessionToken, types } }) => {
      // Airport mode matches the bundled IATA list first and only reaches Google as a
      // fallback (guarded internally in getAirportsForQuery) — it works with this flag off.
      if (types === 'airport') return getAirportsForQuery(input, sessionToken);

      if (!isEnabled("integration:google-places:places")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Places integration is not available in this environment.",
        });
      }
      return getPlaceAutocomplete(input, sessionToken, types);
    }),

  /**
   * Returns the nearest/most relevant airport for a given city name.
   * Used to auto-populate the flight destination when coming from the trip planner.
   */
  nearestAirport: flaggedProcedure("api:places")
    .input(z.object({ cityName: z.string().min(1) }))
    .query(async ({ input: { cityName } }) => {
      if (!isEnabled("integration:google-places:places")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Places integration is not available in this environment.",
        });
      }
      return getNearestAirport(cityName);
    }),

  /**
   * Resolves a placeId → lat/lng.
   * Checks Redis cache first (keyed by placeId, 30-day TTL).
   * On cache miss: calls Place Details API, which closes the billing session.
   */
  getLatLng: flaggedProcedure("api:places")
    .input(z.object({
      placeId: z.string().min(1),
      sessionToken: z.string().uuid(),
    }))
    .query(async ({ input: { placeId, sessionToken } }) => {
      // Bundled-airport picks (placeId "iata:XXX") resolve locally — no Google call, so
      // they work with this flag off. Everything else still needs live Google Places.
      if (!placeId.startsWith('iata:') && !isEnabled("integration:google-places:places")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Places integration is not available in this environment.",
        });
      }
      return getPlaceLatLng(placeId, sessionToken);
    }),

  /**
   * Returns a publicly-accessible photo CDN URL for a place.
   * Cached in Redis for 7 days — returns null if no photo is found.
   */
  getPhoto: flaggedProcedure("api:places")
    .input(z.object({ name: z.string(), address: z.string() }))
    .query(async ({ input: { name, address } }) => {
      if (!isEnabled("integration:google-places:places")) return null;
      const ref = await getPlacePhoto(name, address);
      if (!ref) return null;
      return `/api/place-photo?ref=${encodeURIComponent(ref)}`;
    }),
});
