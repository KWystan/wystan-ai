// ── Project routes ─────────────────────────────────────────────────

const { Router } = require('express');
const { supabaseAdmin } = require('../supabase');

const router = Router();

/* ── List projects for the authenticated user ───────────────────
 *  Returns: [{ id, name, created_at, updated_at, user_id }] */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (err) {
    console.error('List projects error:', err);
    return res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/* ── Get single project (with its conversations) ────────────────
 *  Returns: { project, conversations } */
router.get('/:id', async (req, res) => {
  try {
    const [projectRes, convRes] = await Promise.all([
      supabaseAdmin.from('projects').select('*').eq('id', req.params.id).eq('user_id', req.user.id).single(),
      supabaseAdmin.from('conversations').select('*').eq('project_id', req.params.id).order('updated_at', { ascending: false }),
    ]);

    if (projectRes.error) {
      if (projectRes.error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Project not found' });
      }
      return res.status(500).json({ error: projectRes.error.message });
    }

    return res.json({
      project: projectRes.data,
      conversations: convRes.data || [],
    });
  } catch (err) {
    console.error('Get project error:', err);
    return res.status(500).json({ error: 'Failed to fetch project' });
  }
});

/* ── Create project ─────────────────────────────────────────────
 *  Body: { name }
 *  Returns: the new project */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({ user_id: req.user.id, name: name.trim() })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Create project error:', err);
    return res.status(500).json({ error: 'Failed to create project' });
  }
});

/* ── Update project ─────────────────────────────────────────────
 *  Body: { name }
 *  Returns: the updated project */
router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('projects')
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data);
  } catch (err) {
    console.error('Update project error:', err);
    return res.status(500).json({ error: 'Failed to update project' });
  }
});

/* ── Delete project ─────────────────────────────────────────────
 *  Note: Conversations referencing this project get project_id = null
 *  via cascade SET NULL on the DB side. */
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    return res.status(500).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
