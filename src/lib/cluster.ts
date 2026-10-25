/**
 * Greedy distance clustering in screen space. Each point joins the first
 * cluster whose seed lies within `radius` pixels, otherwise it seeds a new
 * one, so no two cluster seeds are closer than `radius`. This keeps dense
 * areas (cities can have hundreds of stations) readable, keeps touch targets
 * from overlapping, and keeps the number of DOM markers small on phones.
 */
export interface ScreenPoint<T> {
  x: number;
  y: number;
  item: T;
}

export interface Cluster<T> {
  /** Mean position of the members, in the same screen space. */
  x: number;
  y: number;
  items: T[];
}

export function clusterPoints<T>(points: readonly ScreenPoint<T>[], radius: number): Cluster<T>[] {
  const radiusSquared = radius * radius;
  // Seeds are bucketed by a grid of `radius`-sized cells, so a lookup checks 9 cells at most.
  const grid = new Map<string, number[]>();
  const seeds: { x: number; y: number; sumX: number; sumY: number; items: T[] }[] = [];
  const cellOf = (value: number): number => Math.floor(value / radius);

  for (const point of points) {
    const cx = cellOf(point.x);
    const cy = cellOf(point.y);
    let joined = false;
    search: for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const index of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const seed = seeds[index];
          if (seed == null) continue;
          const distanceSquared = (seed.x - point.x) ** 2 + (seed.y - point.y) ** 2;
          if (distanceSquared < radiusSquared) {
            seed.sumX += point.x;
            seed.sumY += point.y;
            seed.items.push(point.item);
            joined = true;
            break search;
          }
        }
      }
    }
    if (!joined) {
      const key = `${cx}:${cy}`;
      const bucket = grid.get(key) ?? [];
      bucket.push(seeds.length);
      grid.set(key, bucket);
      seeds.push({ x: point.x, y: point.y, sumX: point.x, sumY: point.y, items: [point.item] });
    }
  }

  return seeds.map((seed) => ({
    x: seed.sumX / seed.items.length,
    y: seed.sumY / seed.items.length,
    items: seed.items,
  }));
}
