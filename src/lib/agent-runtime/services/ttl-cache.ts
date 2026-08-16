/**
 * Small module-scoped TTL cache.
 *
 * Used for values that are expensive to fetch, identical across requests, and
 * tolerable to serve slightly stale: the deployed-agent list, the display-name
 * to engine-id mapping, and the provider instances that hold a GoogleAuth
 * client. All previously either re-fetched on every request or lived in an
 * unbounded process-global static that was never cleared.
 *
 * Entries expire by time and the map is swept on write, so it cannot grow
 * without bound the way a plain `static Map` does.
 */
export class TtlCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): T {
    this.sweep();
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

/**
 * Memoises an async call in a cache of in-flight promises.
 *
 * The promise is cached rather than only its result, so N concurrent requests
 * for a cold key produce one upstream call instead of N. A rejection is evicted
 * immediately: caching a failure would serve the error for the rest of the TTL
 * and turn a transient blip into a sustained outage.
 */
export async function memoize<T>(
  cache: TtlCache<Promise<T>>,
  key: string,
  factory: () => Promise<T>
): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit;

  const pending = factory();
  cache.set(key, pending);

  try {
    return await pending;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}
