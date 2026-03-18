export class MemoryRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key)?.filter((entry) => entry > now - windowMs) ?? [];

    if (bucket.length >= limit) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.push(now);
    this.buckets.set(key, bucket);
    return true;
  }
}
