export interface NormalizedRoomRate {
  id: string;
  total_amount: string;
  total_currency: string;
  board_type: string;
  payment_type: string;
  quantity_available: number | null;
  cancellation_timeline: Array<{ refund_amount: string; before: string; currency: string }>;
}

export interface NormalizedRoom {
  name: string;
  beds: Array<{ type: string; count: number }>;
  photos: Array<{ url: string }>;
  rates: NormalizedRoomRate[];
}

export function bedsKey(beds: NormalizedRoom["beds"]): string {
  return [...beds]
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((b) => `${b.count}x${b.type}`)
    .join("|");
}

/**
 * Many hotel suppliers feed Duffel one `StaysRoom` entry per rate plan
 * (refundable, non-refundable, member rate, breakfast-included, prepay…) for
 * what is physically the same room, rather than nesting all the rates under
 * one room. Group those back into one card per room type — keyed on
 * name+beds, not on anything from `rates` — and fold every rate plan into
 * that room's `rates` array. `cheapestRoomRate()` in HotelDetailModal.tsx
 * already reduces a room's `rates` to the minimum price, so merging is
 * lossless: the same cheapest rate still wins, just from one card instead of
 * N duplicate cards.
 */
export function groupDuffelRooms(rooms: NormalizedRoom[]): NormalizedRoom[] {
  const groups = new Map<string, NormalizedRoom>();

  for (const room of rooms) {
    const key = `${room.name.trim().toLowerCase()}::${bedsKey(room.beds)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...room, rates: [...room.rates] });
      continue;
    }
    existing.rates.push(...room.rates);
    if (existing.photos.length === 0 && room.photos.length > 0) {
      existing.photos = room.photos;
    }
  }

  return [...groups.values()];
}
