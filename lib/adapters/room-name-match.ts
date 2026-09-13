import { tokenize, jaccardSimilarity } from "@/lib/textMatch";
import { bedsKey, type NormalizedRoom } from "@/lib/adapters/duffel-rooms-adapter";

// Synonyms that describe the same physical room feature but tokenize to
// different words, so plain Jaccard similarity sees zero overlap. Add an
// entry only when a real near-duplicate pair fails to merge — mirrors
// PROGRAM_ALIASES in lib/points/programNames.ts.
const ROOM_TOKEN_ALIASES: Record<string, string> = {
  handicap: "accessible",
  disabled: "accessible",
  ada: "accessible",
  dbl: "double",
  sgl: "single",
  std: "standard",
};

function canonicalRoomTokens(name: string): Set<string> {
  const tokens = tokenize(name);
  const canonical = new Set<string>();
  for (const token of tokens) {
    canonical.add(ROOM_TOKEN_ALIASES[token] ?? token);
  }
  return canonical;
}

/**
 * Second dedup pass, after groupDuffelRooms() has already merged exact
 * name+beds matches. Two rooms only get merged here if they already share
 * the same structured beds configuration (bedsKey match) — text similarity
 * on the name is a secondary check within that bucket, never a substitute
 * for it, so two rooms with different bed setups can never merge no matter
 * how similar their names read.
 */
export function groupSimilarRooms(rooms: NormalizedRoom[], threshold = 0.5): NormalizedRoom[] {
  const buckets = new Map<string, NormalizedRoom[]>();
  for (const room of rooms) {
    const key = bedsKey(room.beds);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(room);
    else buckets.set(key, [room]);
  }

  const result: NormalizedRoom[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      result.push(bucket[0]);
      continue;
    }

    const tokenSets = bucket.map((room) => canonicalRoomTokens(room.name));

    // Union-find clustering within the bucket.
    const parent = bucket.map((_, i) => i);
    function find(i: number): number {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }
    function union(a: number, b: number) {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent[rootA] = rootB;
    }

    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (jaccardSimilarity(tokenSets[i], tokenSets[j]) >= threshold) {
          union(i, j);
        }
      }
    }

    const clusters = new Map<number, NormalizedRoom[]>();
    bucket.forEach((room, i) => {
      const root = find(i);
      const cluster = clusters.get(root);
      if (cluster) cluster.push(room);
      else clusters.set(root, [room]);
    });

    for (const cluster of clusters.values()) {
      if (cluster.length === 1) {
        result.push(cluster[0]);
        continue;
      }
      const canonical = cluster.reduce((longest, room) =>
        room.name.length > longest.name.length ? room : longest,
      );
      const rates = cluster.flatMap((room) => room.rates);
      const photos = cluster.find((room) => room.photos.length > 0)?.photos ?? [];
      result.push({ ...canonical, rates, photos });
    }
  }

  return result;
}
