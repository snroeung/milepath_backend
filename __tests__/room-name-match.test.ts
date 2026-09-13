import { describe, it, expect } from 'vitest';
import { groupSimilarRooms } from '@/lib/adapters/room-name-match';
import type { NormalizedRoom, NormalizedRoomRate } from '@/lib/adapters/duffel-rooms-adapter';

function mkRate(overrides: Partial<NormalizedRoomRate> = {}): NormalizedRoomRate {
  return {
    id: 'rate-1',
    total_amount: '100.00',
    total_currency: 'USD',
    board_type: 'room_only',
    payment_type: 'pay_now',
    quantity_available: 3,
    cancellation_timeline: [],
    ...overrides,
  };
}

function mkRoom(overrides: Partial<NormalizedRoom> = {}): NormalizedRoom {
  return {
    name: 'King Studio',
    beds: [{ type: 'king', count: 1 }],
    photos: [],
    rates: [mkRate()],
    ...overrides,
  };
}

describe('groupSimilarRooms()', () => {
  it('1. merges wording variants of the same room when beds match — "King Studio" vs "Studio, King Bed"', () => {
    const a = mkRoom({ name: 'King Studio', rates: [mkRate({ id: 'r1' })] });
    const b = mkRoom({ name: 'Studio, King Bed', rates: [mkRate({ id: 'r2' })] });
    const result = groupSimilarRooms([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].rates.map(r => r.id)).toEqual(['r1', 'r2']);
  });

  it('2. picks the longer, more descriptive name as canonical', () => {
    const a = mkRoom({ name: 'King Studio' });
    const b = mkRoom({ name: 'Studio, King Bed' });
    const result = groupSimilarRooms([a, b]);
    expect(result[0].name).toBe('Studio, King Bed');
  });

  it('3. does not merge same-beds rooms with low name overlap — "Deluxe King" vs "Premium King"', () => {
    const a = mkRoom({ name: 'Deluxe King' });
    const b = mkRoom({ name: 'Premium King' });
    expect(groupSimilarRooms([a, b])).toHaveLength(2);
  });

  it('4. never merges across different beds, even with identical names', () => {
    const a = mkRoom({ name: 'King Studio', beds: [{ type: 'king', count: 1 }] });
    const b = mkRoom({
      name: 'King Studio',
      beds: [{ type: 'king', count: 1 }, { type: 'sofa', count: 1 }],
    });
    expect(groupSimilarRooms([a, b])).toHaveLength(2);
  });

  it('5. ROOM_TOKEN_ALIASES resolves a synonym pair with zero raw token overlap — "ADA Room" vs "Accessible Room"', () => {
    const a = mkRoom({ name: 'ADA Room' });
    const b = mkRoom({ name: 'Accessible Room' });
    expect(groupSimilarRooms([a, b])).toHaveLength(1);
  });

  it('6. combines rates losslessly and keeps the first non-empty photos on merge', () => {
    const a = mkRoom({
      name: 'King Studio',
      photos: [],
      rates: [mkRate({ id: 'r1', total_amount: '120.00' })],
    });
    const b = mkRoom({
      name: 'Studio, King Bed',
      photos: [{ url: 'studio.jpg' }],
      rates: [mkRate({ id: 'r2', total_amount: '95.00' })],
    });
    const result = groupSimilarRooms([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].rates).toHaveLength(2);
    expect(result[0].photos).toEqual([{ url: 'studio.jpg' }]);
  });

  it('7. leaves a bucket of size 1 unchanged', () => {
    const room = mkRoom();
    const result = groupSimilarRooms([room]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(room);
  });

  it('8. empty input returns empty array', () => {
    expect(groupSimilarRooms([])).toEqual([]);
  });
});
