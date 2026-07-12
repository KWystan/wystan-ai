// ── Conversation routes + nested message routes ────────────────────

const { Router } = require('express');
const { supabaseAdmin } = require('../supabase');

const router = Router();

/* ── List conversations for the authenticated user ──────────────
 *  Query: ?project_id=xxx (optional, filter by project)
 *  Returns: [{ id, title, created_at, updated_at, project_id, user_id }] */
router.get('/', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    // Optional filter by project_id
    const projectId = req.query.project_id;
    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (err) {
    console.error('List conversations error:', err);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/* ── Create conversation ────────────────────────────────────────
 *  Body: { title, project_id? }
 *  Returns: { id, title, user_id, project_id, ... } */
router.post('/', async (req, res) => {
  try {
    const { title, project_id } = req.body;

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        user_id: req.user.id,
        title: title || 'New conversation',
        project_id: project_id || null,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Create conversation error:', err);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/* ── Update conversation ────────────────────────────────────────
 *  Body: { title?, project_id? }
 *  Returns: the updated conversation */
router.put('/:id', async (req, res) => {
  try {
    const updates = { updated_at: new Date().toISOString() };
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.project_id !== undefined) updates.project_id = req.body.project_id;

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data);
  } catch (err) {
    console.error('Update conversation error:', err);
    return res.status(500).json({ error: 'Failed to update conversation' });
  }
});

/* ── Delete conversation ──────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete conversation error:', err);
    return res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/* ── Get messages for a conversation ────────────────────────────
 *  Returns: [{ id, role, content, created_at }] */
router.get('/:id/messages', async (req, res) => {
  try {
    // Verify the conversation belongs to the user
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (convErr) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('role, content')
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
});

/* ── Save messages to a conversation ────────────────────────────
 *  Body: { messages: [{ role, content }] }
 *  Also bumps the conversation's updated_at. */
router.post('/:id/messages', async (req, res) => {
  try {
    const msgList = req.body.messages;
    if (!Array.isArray(msgList) || msgList.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Verify the conversation belongs to the user
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (convErr) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = msgList.map((m) => ({
      conversation_id: req.params.id,
      role: m.role,
      content: m.content,
    }));

    const { error } = await supabaseAdmin.from('messages').insert(messages);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Bump updated_at
    await supabaseAdmin
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    return res.json({ success: true });
  } catch (err) {
    console.error('Save messages error:', err);
    return res.status(500).json({ error: 'Failed to save messages' });
  }
});

module.exports = router;
