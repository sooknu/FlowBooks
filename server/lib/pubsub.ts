import IORedis from 'ioredis';
import { EventEmitter } from 'node:events';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const pubClient = new IORedis(redisUrl);
const subClient = new IORedis(redisUrl);

const CHANNEL = 'flowbooks:changes';

// Local event bus — SSE connections listen here, Redis sub feeds into it
export const localBus = new EventEmitter();
localBus.setMaxListeners(0); // unlimited SSE connections

// One-time Redis subscription setup
let subscribed = false;
function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  subClient.subscribe(CHANNEL);
  subClient.on('message', (channel, message) => {
    if (channel === CHANNEL) localBus.emit('change', message);
  });
}
ensureSubscribed();

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
