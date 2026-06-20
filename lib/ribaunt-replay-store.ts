import Redis from 'ioredis';
import type { ReplayStore } from 'ribaunt';

let redis: Redis | undefined;

function getRibauntRedis(): Redis {
  if (redis) {
    return redis;
  }

  const url = process.env.RIBAUNT_REDIS_URL;
  if (!url) {
    throw new Error('Missing required environment variable: RIBAUNT_REDIS_URL');
  }

  const hostname = new URL(url).hostname;
  redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    tls: hostname.endsWith('.upstash.io') ? {} : undefined,
  });

  return redis;
}

export const ribauntReplayStore: ReplayStore = {
  async consume(jti, expiresAt) {
    const expiresAtMs = expiresAt * 1000;
    const ttlMs = Math.max(1, expiresAtMs - Date.now());
    const result = await getRibauntRedis().set(`ribaunt:replay:${jti}`, '1', 'PX', ttlMs, 'NX');

    return result === 'OK';
  },
};
