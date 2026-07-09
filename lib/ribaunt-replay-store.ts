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

const KEY_PREFIX = 'ribaunt:replay:';

const CONSUME_MANY_SCRIPT = `
  local ttlMs = tonumber(ARGV[1])
  for i = 1, #KEYS do
    if redis.call('EXISTS', KEYS[i]) == 1 then
      return 0
    end
  end
  for i = 1, #KEYS do
    redis.call('SET', KEYS[i], '1', 'PX', ttlMs)
  end
  return 1
`;

export const ribauntReplayStore: ReplayStore = {
  async consume(jti, expiresAt) {
    const expiresAtMs = expiresAt * 1000;
    const ttlMs = Math.max(1, expiresAtMs - Date.now());
    const result = await getRibauntRedis().set(`${KEY_PREFIX}${jti}`, '1', 'PX', ttlMs, 'NX');

    return result === 'OK';
  },

  async consumeMany(jtis, expiresAt) {
    const expiresAtMs = expiresAt * 1000;
    const ttlMs = Math.max(1, expiresAtMs - Date.now());
    const keys = jtis.map((jti) => `${KEY_PREFIX}${jti}`);
    const result = await getRibauntRedis().eval(CONSUME_MANY_SCRIPT, keys.length, ...keys, ttlMs);

    return result === 1;
  },
};
