import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { requireAdmin } from '../lib/permissions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico']);

function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\<>:"|?*\x00]/g, '_');
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export default async function storageRoutes(fastify: any) {
  // POST /api/storage/avatars
  fastify.post('/avatars', async (request: any, reply: any) => {
    const data = await request.file();
    if (!data) {
      return fastify.httpErrors.badRequest('No file uploaded');
    }

    const ext = (path.extname(data.filename) || '.png').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return reply.code(400).send({ error: `File type ${ext} not allowed` });
    }
    const safeName = sanitizeFilename(data.filename);
    const fileName = `${request.user.id}-avatar-${Date.now()}${ext}`;
    const dir = path.join(UPLOADS_DIR, 'avatars');
    await ensureDir(dir);

    const filePath = path.join(dir, fileName);
    const buffer = await data.toBuffer();
    await fs.writeFile(filePath, buffer);

    const publicUrl = `/uploads/avatars/${fileName}`;
    return { data: { publicUrl } };
  });

  // POST /api/storage/branding (admin only)
  fastify.post('/branding', { preHandler: [requireAdmin] }, async (request: any, reply: any) => {
    const data = await request.file();
    if (!data) {
      return fastify.httpErrors.badRequest('No file uploaded');
    }

    const ext = (path.extname(data.filename) || '.png').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return reply.code(400).send({ error: `File type ${ext} not allowed` });
    }
    const safeName = sanitizeFilename(data.filename);
    // Use the 'type' field from the form if provided, else use original filename
    const type = data.fields?.type?.value || path.basename(safeName, ext);
    const fileName = `${type}-${Date.now()}${ext}`;
    const dir = path.join(UPLOADS_DIR, 'branding');
    await ensureDir(dir);

    const filePath = path.join(dir, fileName);
    const buffer = await data.toBuffer();
    await fs.writeFile(filePath, buffer);

    const publicUrl = `/uploads/branding/${fileName}`;
    return { data: { publicUrl } };
  });
}
