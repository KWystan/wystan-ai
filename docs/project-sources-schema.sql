-- Project Sources table
-- Stores files uploaded as shared context for all conversations in a project.
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS project_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,          -- extension: pdf, docx, txt, etc.
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  content TEXT,                     -- extracted text for LLM context
  blob_url TEXT,                    -- Azure Blob Storage URL
  stored BOOLEAN DEFAULT false,     -- whether it was persisted to Azure
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_project_sources_project ON project_sources(project_id);
CREATE INDEX IF NOT EXISTS idx_project_sources_user ON project_sources(user_id);

-- Enable Row Level Security
ALTER TABLE project_sources ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see their own project sources
CREATE POLICY "Users can manage their own project sources"
  ON project_sources
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ===============================================================
-- Storage usage table (for Azure Blob Storage quota tracking)
-- ===============================================================

CREATE TABLE IF NOT EXISTS storage_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  blob_url TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,        -- 'image' | 'doc'
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, blob_url)
);

CREATE INDEX IF NOT EXISTS idx_storage_usage_user ON storage_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_usage_type ON storage_usage(user_id, file_type);

ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;

-- RLS: admin-only access (queried by server via supabaseAdmin which bypasses RLS)
-- No user-scoped policies needed since storage_usage is managed server-side
