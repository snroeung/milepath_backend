import { vi, beforeEach, describe, it, expect, type Mock } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('@/lib/feature-flags', () => ({
  isEnabled: vi.fn(),
}));

import { redis } from '@/lib/redis';
import { isEnabled } from '@/lib/feature-flags';
import { getAirportsForQuery } from '@/lib/places';

const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

const NRT = { place_id: 'nrt_id', description: 'Narita International Airport (NRT), Narita, Chiba, Japan' };
const HND = { place_id: 'hnd_id', description: 'Haneda Airport (HND), Ota, Tokyo, Japan' };
const JAPAN = { place_id: 'japan_id', types: ['country', 'political'] };

function mockJapanAirports(onCountryCall?: () => void) {
  server.use(
    http.get(AUTOCOMPLETE_URL, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const types = params.get('types');
      const components = params.get('components');

      if (types === 'airport' && components === 'country:JP') {
        onCountryCall?.();
        return HttpResponse.json({ status: 'OK', predictions: [NRT, HND] });
      }
      if (types === 'airport') return HttpResponse.json({ status: 'ZERO_RESULTS', predictions: [] });
      if (types === '(regions)') return HttpResponse.json({ status: 'OK', predictions: [JAPAN] });
      return HttpResponse.json({ status: 'ZERO_RESULTS', predictions: [] });
    }),
    http.get(DETAILS_URL, () => HttpResponse.json({
      status: 'OK',
      result: { address_components: [{ types: ['country', 'political'], short_name: 'JP', long_name: 'Japan' }] },
    })),
  );
}

describe('getAirportsForQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isEnabled as Mock).mockReturnValue(true);
    (redis.get as Mock).mockResolvedValue(null);
    (redis.set as Mock).mockResolvedValue('OK');
  });

  it('matches a bundled IATA code without calling Google — covers airports like CUN that Google\'s text match misses', async () => {
    let googleCalled = false;
    server.use(http.get(AUTOCOMPLETE_URL, () => {
      googleCalled = true;
      return HttpResponse.json({ status: 'ZERO_RESULTS', predictions: [] });
    }));

    const result = await getAirportsForQuery('CUN', 'session-1');

    expect(result[0]).toEqual({ placeId: 'iata:CUN', description: expect.stringContaining('(CUN)') });
    expect(googleCalled).toBe(false);
  });

  it('matches a bundled airport by city name', async () => {
    const result = await getAirportsForQuery('Cancun', 'session-1');

    expect(result).toEqual([{ placeId: 'iata:CUN', description: expect.stringContaining('(CUN)') }]);
  });

  it('falls back to Google for a direct match when nothing in the bundled list matches', async () => {
    server.use(
      http.get(AUTOCOMPLETE_URL, ({ request }) => {
        const types = new URL(request.url).searchParams.get('types');
        if (types === 'airport') {
          return HttpResponse.json({
            status: 'OK',
            predictions: [{ place_id: 'made_up_id', description: 'Made Up Private Strip (ZZZ), Nowhere' }],
          });
        }
        return HttpResponse.json({ status: 'ZERO_RESULTS', predictions: [] });
      }),
    );

    const result = await getAirportsForQuery('zzzznonexistentplace', 'session-1');

    expect(result).toEqual([{ placeId: 'made_up_id', description: 'Made Up Private Strip (ZZZ), Nowhere' }]);
  });

  it('falls back to a country\'s airports when neither the bundled list nor a direct Google match exist', async () => {
    mockJapanAirports();

    const result = await getAirportsForQuery('Japan', 'session-1');

    expect(result).toEqual([
      { placeId: 'nrt_id', description: NRT.description },
      { placeId: 'hnd_id', description: HND.description },
    ]);
  });

  it('returns an empty list when the input matches neither a bundled airport, a direct Google match, nor a country', async () => {
    server.use(http.get(AUTOCOMPLETE_URL, () => HttpResponse.json({ status: 'ZERO_RESULTS', predictions: [] })));

    const result = await getAirportsForQuery('asdfqwerasdfqwer', 'session-1');

    expect(result).toEqual([]);
  });

  it('caches the resolved country airport list and reuses it on the next lookup', async () => {
    let countryCallCount = 0;
    mockJapanAirports(() => { countryCallCount += 1; });

    await getAirportsForQuery('Japan', 'session-1');
    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, value, opts] = (redis.set as Mock).mock.calls[0];
    expect(key).toBe('place:country-airports:JP');
    expect(value).toEqual([
      { placeId: 'nrt_id', description: NRT.description },
      { placeId: 'hnd_id', description: HND.description },
    ]);
    expect(opts).toEqual({ ex: 60 * 60 * 24 });
    expect(countryCallCount).toBe(1);

    // Second lookup: cache hit skips the live country-restricted autocomplete call.
    (redis.get as Mock).mockResolvedValue([
      { placeId: 'nrt_id', description: NRT.description },
      { placeId: 'hnd_id', description: HND.description },
    ]);

    const result = await getAirportsForQuery('Japan', 'session-2');

    expect(result).toEqual([
      { placeId: 'nrt_id', description: NRT.description },
      { placeId: 'hnd_id', description: HND.description },
    ]);
    expect(countryCallCount).toBe(1);
  });

  it('skips the Google fallback entirely when the Google Places integration is disabled', async () => {
    (isEnabled as Mock).mockReturnValue(false);
    let googleCalled = false;
    server.use(http.get(AUTOCOMPLETE_URL, () => {
      googleCalled = true;
      return HttpResponse.json({ status: 'ZERO_RESULTS', predictions: [] });
    }));

    const result = await getAirportsForQuery('zzzznonexistentplace', 'session-1');

    expect(result).toEqual([]);
    expect(googleCalled).toBe(false);
  });
});
