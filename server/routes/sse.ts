import { localBus } from '../lib/pubsub';

export default async function sseRoutes(fastify: any) {
  // GET /api/sse — Server-Sent Events stream (auth required via existing middleware)
  fastify.get('/', async (request: any, reply: any) => {
    // Bypass @fastify/compress — compression buffers chunks which breaks SSE streaming
    request.raw.headers['accept-encoding'] = 'identity';

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // tells Nginx to disable proxy buffering
    });

    // Send connection confirmation
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // Forward pub/sub events to this SSE connection
    const handler = (message: string) => {
      try {
        reply.raw.write(`data: ${message}\n\n`);
      } catch {
        // Client disconnected — cleanup happens in close handler
      }
    };
    localBus.on('change', handler);

    // Heartbeat every 30s to prevent proxy/load-balancer timeouts
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    // Cleanup on client disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      localBus.removeListener('change', handler);
    });
  });
}
