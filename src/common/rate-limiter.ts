import { HttpException, HttpStatus } from '@nestjs/common';

/** In-memory sliding window: at most `limit` hits per key within `windowMs`. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly message: string,
  ) {}

  hit(key: string): void {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < this.windowMs,
    );
    if (recent.length >= this.limit) {
      throw new HttpException(this.message, HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(key, recent);
    // forget idle visitors so the map doesn't grow forever
    if (this.hits.size > 10_000) this.hits.clear();
  }
}
