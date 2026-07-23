// ── File upload routes ────────────────────────────────────────────
// Handles multipart file uploads, PDF screenshots, and Azure Blob
// Storage for logged-in users.

const { Router } = require('express');
const multer = require('multer');
const path = require('path');

const { uploadBlob, deleteBlob, isConfigured } = require('../blob');
const { checkQuota, checkImageLimit, recordUsage, deleteUsage } = require('../storage');
const { getFileInfo } = require('../file-types');
const { extractText, truncateContent } = require('../extractors');
const { validate, schemas } = require('../validators');
const { asyncHandler } = require('../errors');

// Auth middleware — gracefully unavailable when Supabase isn't installed
let optionalAuth, requireAuth;
try {
  const mw = require('./middleware');
  optionalAuth = mw.optionalAuth;
  requireAuth = mw.requireAuth;
} catch {
  // Supabase not available — auth middleware stays undefined
}

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/**
 * POST /api/upload — Upload a file.
 * Processes images → base64, documents → extracted text,
 * optionally stores in Azure Blob for authenticated users.
 */
router.post('/', optionalAuth, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { originalname, mimetype, size, buffer } = req.file;

  /* Determine file type from extension first, fall back to MIME */
  const ext = path.extname(originalname).toLowerCase().replace('.', '');
  const info = getFileInfo(ext, mimetype);

  // Build base response with metadata
  const response = {
    filename: originalname,
    mimetype,
    size,
    type: info.type,
    group: info.group,
    language: info.language || null,
  };

  /* ── Images ────────────────────────────────────────────────── */
  if (info.group === 'image') {
    response.data = `data:${mimetype};base64,${buffer.toString('base64')}`;
  } else {
    /* ── All other file types: extract text content ────────── */
    response.content = await extractText(buffer, ext, mimetype);

    /* ── PDF preview pages ─────────────────────────────────── */
    if (info.type === 'pdf') {
      let PDFParse;
      try {
        PDFParse = require('pdf-parse').PDFParse;
      } catch (e) {
        // pdf-parse not available — skip screenshots
      }
      if (PDFParse) {
        try {
          const parser = new PDFParse({ data: buffer });
          const result = await parser.getScreenshot({
            imageDataUrl: true,
            imageBuffer: false,
          });
          response.pages = result.pages.map((p) => p.dataUrl);
        } catch (e) {
          console.error('PDF screenshot failed:', e.message);
        }
      }
    }
  }

  // Truncate content for LLM context window safety
  if (response.content) {
    response.content = truncateContent(response.content);
  }

  /* -- Azure Blob Storage (logged-in users only) -------------------- */
  if (req.user && isConfigured()) {
    try {
      const userId = req.user.id;
      const folder = info.group === 'image' ? 'images' : 'docs';
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${originalname}`;

      // Check quotas before upload
      if (folder === 'images') {
        const imgLimit = await checkImageLimit(userId);
        if (!imgLimit.allowed) {
          response.stored = false;
          response.storageError = imgLimit.error;
          return res.status(403).json({ ...response, error: imgLimit.error });
        }
      }

      const quota = await checkQuota(userId, size);
      if (!quota.allowed) {
        response.stored = false;
        response.storageError = quota.error;
        return res.status(403).json({ ...response, error: quota.error });
      }

      // Upload to Azure
      const { blobUrl } = await uploadBlob(userId, folder, uniqueName, buffer, mimetype);

      // Record in Supabase
      await recordUsage(userId, blobUrl, originalname, info.group, size);

      response.stored = true;
      response.blobUrl = blobUrl;
      response.storage = {
        usedBytes: quota.usedBytes + size,
        remainingBytes: quota.remainingBytes - size,
      };
    } catch (azureErr) {
      // Azure failure is non-blocking — file is still processed ephemerally
      console.error('[Upload] Azure storage failed (non-blocking):', azureErr.message);
      response.stored = false;
      response.storageError = 'Cloud storage unavailable. File processed in-memory.';
    }
  } else {
    response.stored = false;
  }

  res.json(response);
}));

/**
 * DELETE /api/upload — Delete a file from Azure Blob Storage.
 */
router.delete('/', requireAuth, validate(schemas.deleteUpload), asyncHandler(async (req, res) => {
  const { blobUrl } = req.body;
  await deleteBlob(blobUrl);
  await deleteUsage(blobUrl);
  res.json({ success: true });
}));

module.exports = router;
