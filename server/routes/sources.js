// -- Project Sources routes ----------------------------------------------
// Handles file uploads that serve as shared context for all conversations
// within a project. Files are stored in Azure Blob Storage.

const { Router } = require('express');
const multer = require('multer');
const path = require('path');

const { supabaseAdmin } = require('../supabase');
const { uploadBlob, deleteBlob, isConfigured } = require('../blob');
const { checkQuota, recordUsage, deleteUsage } = require('../storage');
const { extractText } = require('../extractors');
const { truncateContent } = require('../extractors');

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

/**
 * POST /api/projects/:id/sources � Upload a file as a project source.
 * Stores in Azure Blob + records in project_sources table.
 */
router.post('/:id/sources', upload.single('file'), async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, size, buffer } = req.file;
    const ext = path.extname(originalname).toLowerCase().replace('.', '');

    // Verify project belongs to user
    const { data: project, error: projErr } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (projErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Extract text content (truncated for LLM context window safety)
    const rawContent = await extractText(buffer, ext, mimetype);
    const content = truncateContent(rawContent);

    // Upload to Azure Blob Storage
    let blobUrl = null;
    let stored = false;

    if (isConfigured()) {
      try {
        // Check quota
        const quota = await checkQuota(userId, size);
        if (!quota.allowed) {
          return res.status(403).json({ error: quota.error });
        }

        const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${originalname}`;
        const result = await uploadBlob(userId, 'docs', uniqueName, buffer, mimetype);
        blobUrl = result.blobUrl;
        stored = true;

        // Record usage
        await recordUsage(userId, blobUrl, originalname, 'doc', size);
      } catch (azureErr) {
        console.error('[Sources] Azure upload failed (non-blocking):', azureErr.message);
      }
    }

    // Save to project_sources table
    const { data, error } = await supabaseAdmin
      .from('project_sources')
      .insert({
        project_id: projectId,
        user_id: userId,
        filename: originalname,
        file_type: ext,
        mime_type: mimetype,
        size_bytes: size,
        content: content || '(text extraction unavailable)',
        blob_url: blobUrl,
        stored,
      })
      .select()
      .single();

    if (error) {
      console.error('[Sources] DB insert error:', error.message);
      return res.status(500).json({
        error: 'Failed to save source',
        detail: error.message,
        hint: error.message.includes('does not exist')
          ? 'Run docs/project-sources-schema.sql in your Supabase SQL editor to create the table.'
          : error.message.includes('violates row-level security')
            ? 'Check that the user is authenticated and the RLS policy allows inserts.'
            : undefined,
      });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('[Sources] Upload error:', err);
    return res.status(500).json({ error: 'Failed to upload source' });
  }
});

/**
 * GET /api/projects/:id/sources � List all sources for a project.
 */
router.get('/:id/sources', async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('project_sources')
      .select('id, project_id, filename, file_type, mime_type, size_bytes, stored, blob_url, content, created_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (err) {
    console.error('[Sources] List error:', err);
    return res.status(500).json({ error: 'Failed to list sources' });
  }
});

/**
 * DELETE /api/projects/:id/sources/:sourceId � Delete a source.
 */
router.delete('/:id/sources/:sourceId', async (req, res) => {
  try {
    const { id: projectId, sourceId } = req.params;
    const userId = req.user.id;

    // Get the source record
    const { data: source, error: fetchErr } = await supabaseAdmin
      .from('project_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    // Delete from Azure if stored
    if (source.blob_url) {
      try {
        await deleteBlob(source.blob_url);
        await deleteUsage(source.blob_url);
      } catch (azureErr) {
        console.error('[Sources] Azure delete error:', azureErr.message);
      }
    }

    // Delete from project_sources
    const { error: delErr } = await supabaseAdmin
      .from('project_sources')
      .delete()
      .eq('id', sourceId);

    if (delErr) {
      return res.status(500).json({ error: delErr.message });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[Sources] Delete error:', err);
    return res.status(500).json({ error: 'Failed to delete source' });
  }
});

module.exports = router;
