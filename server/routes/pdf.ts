import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePdfBase64 } from '../lib/generatePdf';
import { db } from '../db';
import { pdfDocuments, quotes, invoices } from '../db/schema';
import { eq } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const documentsDir = path.join(__dirname, '..', 'uploads', 'documents');

export default async function pdfRoutes(fastify: any) {
  // POST /api/pdf/generate (auth required — handled by middleware)
  fastify.post('/generate', async (request: any, reply: any) => {
    const { type, documentId } = request.body;

    if (!type || !documentId) {
      return { error: 'Missing required fields: type, documentId' };
    }

    try {
      const result = await generatePdfBase64({ type, documentId });
      return result;
    } catch (error: any) {
      return { error: error.message };
    }
  });

  // GET /api/pdf/download/:token (public — token IS the auth)
  fastify.get('/download/:token', async (request: any, reply: any) => {
    const { token } = request.params;

    if (!token || !/^[a-f0-9]{32}$/.test(token)) {
      reply.code(400).send({ error: 'Invalid token' });
      return;
    }

    const [pdfDoc] = await db
      .select()
      .from(pdfDocuments)
      .where(eq(pdfDocuments.token, token));

    if (!pdfDoc) {
      reply.code(404).send({ error: 'PDF not found' });
      return;
    }

    if (pdfDoc.expiresAt && new Date() > pdfDoc.expiresAt) {
      reply.code(410).send({ error: 'Download link has expired' });
      return;
    }

    const filePath = path.join(documentsDir, pdfDoc.fileName);

    if (!fs.existsSync(filePath)) {
      reply.code(404).send({ error: 'PDF file not found' });
      return;
    }

    // Clean filename for the browser (strip the token from the name)
    const displayName = pdfDoc.fileName.replace(/-[a-f0-9]{32}/, '');
    const fileBuffer = fs.readFileSync(filePath);

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="${displayName}"`);
    reply.header('Content-Length', fileBuffer.length);
    reply.send(fileBuffer);
  });
}
