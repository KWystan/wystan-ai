require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { errorHandler } = require('./errors');

// ── Routes (Supabase-dependent; handle missing deps gracefully) ──
let authRouter, conversationsRouter, projectsRouter, sourcesRouter, optionalAuth, requireAuth;
try {
  authRouter = require('./routes/auth');
  conversationsRouter = require('./routes/conversations');
  projectsRouter = require('./routes/projects');
  sourcesRouter = require('./routes/sources');
  const mw = require('./routes/middleware');
  optionalAuth = mw.optionalAuth;
  requireAuth = mw.requireAuth;
  console.log('Supabase client loaded.');
} catch (err) {
  console.warn('Supabase not available — install @supabase/supabase-js and set env vars.');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ── API routes (auth + data) ─────────────────────────────────────
if (authRouter && conversationsRouter && projectsRouter) {
  app.use('/api/auth', authRouter);
  app.use('/api/conversations', optionalAuth, requireAuth, conversationsRouter);
  app.use('/api/projects', optionalAuth, requireAuth, projectsRouter);
  if (sourcesRouter) {
    app.use('/api/projects', optionalAuth, requireAuth, sourcesRouter);
    console.log('Sources router loaded.');
  }

  // Study hub (RAG Q&A, sources, tools)
  const { studyHubRouter } = require('./routes/study');
  if (studyHubRouter) {
    app.use('/api/study', optionalAuth, requireAuth, studyHubRouter);
    console.log('Study hub router loaded.');
  }
}

// ── Feature route modules ───────────────────────────────────────
app.use('/api/upload', require('./routes/upload'));
app.use('/api', require('./routes/chat'));
app.use('/api/generate', require('./routes/generate'));
app.use('/api/search', require('./routes/search'));
app.use('/api', require('./routes/study'));
app.use('/api/storage', require('./routes/storage'));

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ status: 'OK', message: 'Server is running!' });
});

// ── Multer / file-size error handler ─────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File is too large. Maximum size is 10 MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  next(err);
});

// ── Centralized error handler (catches AppError + unexpected errors) ──
app.use(errorHandler);

// Export for Vercel serverless
module.exports = app;

// Start server (only when run directly, not when imported by Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}
