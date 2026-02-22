import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import DOMPurify from 'isomorphic-dompurify';
import { requirePermission } from '../lib/permissions';
import { db } from '../db';
import { projectDocuments } from '../db/schema';
import { eq, and } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico']);
const DOC_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.pdf']);

function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\<>:"|?*\x00]/g, '_');
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function sanitizeSvg(buffer: Buffer): Buffer {
  const raw = buffer.toString('utf-8');
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });
  return Buffer.from(clean, 'utf-8');
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
    let buffer = await data.toBuffer();
    if (ext === '.svg') buffer = sanitizeSvg(buffer);
    await fs.writeFile(filePath, buffer);

    const publicUrl = `/uploads/avatars/${fileName}`;
    return { data: { publicUrl } };
  });

  // POST /api/storage/branding (admin only)
  fastify.post('/branding', { preHandler: [requirePermission('access_settings')] }, async (request: any, reply: any) => {
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
    let buffer = await data.toBuffer();
    if (ext === '.svg') buffer = sanitizeSvg(buffer);
    await fs.writeFile(filePath, buffer);

    const publicUrl = `/uploads/branding/${fileName}`;
    return { data: { publicUrl } };
  });

  // POST /api/storage/project-documents — upload a document to a project
  const ALLOWED_DOC_MIMES = new Set([
    'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'image/heic', 'image/heif',
  ]);

  fastify.post('/project-documents', async (request: any, reply: any) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const projectId = data.fields?.projectId?.value;
    if (!projectId) return reply.code(400).send({ error: 'projectId is required' });

    const ext = (path.extname(data.filename) || '').toLowerCase();
    const mime = (data.mimetype || '').toLowerCase();

    // Allow by extension OR mime type (iOS often sends correct mime but unusual extensions)
    if (!DOC_EXTENSIONS.has(ext) && !ALLOWED_DOC_MIMES.has(mime)) {
      return reply.code(400).send({ error: `File type not allowed. Allowed: PDF, JPG, PNG, HEIC` });
    }

    // Determine a safe extension for storage
    const finalExt = DOC_EXTENSIONS.has(ext) ? ext
      : mime === 'image/jpeg' ? '.jpg'
      : mime === 'image/png' ? '.png'
      : mime === 'image/heic' || mime === 'image/heif' ? '.heic'
      : mime === 'application/pdf' ? '.pdf'
      : ext || '.bin';

    const originalName = data.filename;
    const safeName = sanitizeFilename(originalName);
    const fileName = `${projectId}-${Date.now()}${finalExt}`;
    const dir = path.join(UPLOADS_DIR, 'project-docs');
    await ensureDir(dir);

    const buffer = await data.toBuffer();
    await fs.writeFile(path.join(dir, fileName), buffer);

    const [doc] = await db.insert(projectDocuments).values({
      projectId,
      fileName,
      originalName: safeName,
      mimeType: mime || `application/${finalExt.slice(1)}`,
      fileSize: buffer.length,
      uploadedBy: request.user?.name || request.user?.email || 'Unknown',
    }).returning();

    return { data: doc };
  });

  // GET /api/storage/project-docs/list/:projectId — list documents for a project
  fastify.get('/project-docs/list/:projectId', async (request: any) => {
    const docs = await db.query.projectDocuments.findMany({
      where: eq(projectDocuments.projectId, request.params.projectId),
      orderBy: (d: any, { desc }: any) => [desc(d.createdAt)],
    });
    return { data: docs };
  });

  // GET /api/storage/project-docs/file/:id — serve a document file
  fastify.get('/project-docs/file/:id', async (request: any, reply: any) => {
    const doc = await db.query.projectDocuments.findFirst({
      where: eq(projectDocuments.id, request.params.id),
    });
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const filePath = path.join(UPLOADS_DIR, 'project-docs', doc.fileName);
    try {
      const buffer = await fs.readFile(filePath);
      // Use ASCII-safe fallback + RFC 5987 UTF-8 encoding for non-ASCII filenames
      const asciiName = doc.originalName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
      const utf8Name = encodeURIComponent(doc.originalName);
      return reply
        .header('Content-Type', doc.mimeType)
        .header('Content-Disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`)
        .send(buffer);
    } catch {
      return reply.code(404).send({ error: 'File not found on disk' });
    }
  });

  // DELETE /api/storage/project-docs/:id — delete a document
  fastify.delete('/project-docs/:id', async (request: any, reply: any) => {
    const doc = await db.query.projectDocuments.findFirst({
      where: eq(projectDocuments.id, request.params.id),
    });
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    // Delete file from disk
    try {
      await fs.unlink(path.join(UPLOADS_DIR, 'project-docs', doc.fileName));
    } catch { /* file may already be gone */ }

    await db.delete(projectDocuments).where(eq(projectDocuments.id, doc.id));
    return { success: true };
  });
}
