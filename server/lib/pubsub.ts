import IORedis from 'ioredis';
import { EventEmitter } from 'node:events';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const pubClient = new IORedis(redisUrl, { retryStrategy: (times) => Math.min(times * 200, 5000) });
const subClient = new IORedis(redisUrl, { retryStrategy: (times) => Math.min(times * 200, 5000) });

// Suppress noisy unhandled error events — ioredis auto-reconnects
pubClient.on('error', () => {});
subClient.on('error', () => {});

const CHANNEL = 'flowbooks:changes';

// Local event bus — SSE connections listen here, Redis sub feeds into it
export const localBus = new EventEmitter();
localBus.setMaxListeners(0); // unlimited SSE connections

// Subscribe on connect (and re-subscribe after reconnect)
subClient.on('ready', () => {
  subClient.subscribe(CHANNEL);
});
subClient.on('message', (channel, message) => {
  if (channel === CHANNEL) localBus.emit('change', message);
});

/**
 * Fire-and-forget broadcast. Never throws — errors logged to console.
 * Mirrors the pattern of logActivity() in server/lib/activityLog.ts.
 */
export function broadcast(
  entity: string,
  action: string,
  actorUserId: string,
  entityId?: string,
): void {
  const event = { entity, action, entityId, actorUserId, ts: Date.now() };
  pubClient.publish(CHANNEL, JSON.stringify(event)).catch((err) => {
    console.error('[PubSub] Failed to publish:', err);
  });
}

export async function closePubSub() {
  await pubClient.quit();
  await subClient.quit();
}
