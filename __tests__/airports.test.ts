import { describe, it, expect } from 'vitest';
import { searchAirports, getStaticAirport } from '@/lib/airports';

describe('searchAirports', () => {
  it('matches an exact IATA code, ranked first, including ones Google\'s free-text search misses (e.g. CUN)', () => {
    const result = searchAirports('CUN');

    expect(result[0].placeId).toBe('iata:CUN');
    expect(result[0].description).toContain('Cancun');
    expect(result[0].description).toContain('(CUN)');
  });

  it('is case-insensitive on the IATA code', () => {
    const result = searchAirports('cun');
    expect(result[0].placeId).toBe('iata:CUN');
  });

  it('matches by city name', () => {
    const result = searchAirports('Cancun');
    expect(result.some((r) => r.placeId === 'iata:CUN')).toBe(true);
  });

  it('ranks an exact code match first even when other airports share the prefix', () => {
    const result = searchAirports('jfk');
    expect(result[0].placeId).toBe('iata:JFK');
  });

  it('returns an empty list for empty or whitespace-only input', () => {
    expect(searchAirports('')).toEqual([]);
    expect(searchAirports('   ')).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchAirports('zzzznonexistentplace')).toEqual([]);
  });

  it('caps results to a reasonable dropdown size', () => {
    // "a" matches a huge number of airports by name/city substring.
    const result = searchAirports('a');
    expect(result.length).toBeLessThanOrEqual(8);
  });
});

describe('getStaticAirport', () => {
  it('resolves a synthetic iata: placeId back to its coordinates', () => {
    const airport = getStaticAirport('iata:CUN');
    expect(airport).toBeDefined();
    expect(airport?.iata).toBe('CUN');
    expect(airport?.lat).toBeCloseTo(21.0365, 2);
    expect(airport?.lon).toBeCloseTo(-86.8771, 2);
  });

  it('returns undefined for a non-airport placeId (a real Google place_id)', () => {
    expect(getStaticAirport('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBeUndefined();
  });
});
