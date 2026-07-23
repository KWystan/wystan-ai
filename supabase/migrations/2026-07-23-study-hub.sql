-- Study Hub migration: sources + chunks tables with pgvector

-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- Sources: one per uploaded file
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  chunk_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Chunks: one per text segment with embedding
create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  page_number int,
  raw_text text not null,
  embedding vector(384),
  tags jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_sources_user_id on sources(user_id);
create index if not exists idx_chunks_source_id on chunks(source_id);
create index if not exists idx_chunks_embedding on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS: users see their own data
alter table sources enable row level security;
alter table chunks enable row level security;

create policy "Users manage their own sources"
  on sources for all
  using (auth.uid() = user_id);

create policy "Users manage their own chunks"
  on chunks for all
  using (
    source_id in (select id from sources where user_id = auth.uid())
  );

-- Search function: cosine similarity over active sources
create or replace function search_chunks(
  p_user_id uuid,
  p_source_ids uuid[],
  p_embedding vector(384),
  p_top_k int default 20
)
returns table (
  id uuid,
  source_id uuid,
  page_number int,
  raw_text text,
  tags jsonb,
  vector_score float
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.source_id,
    c.page_number,
    c.raw_text,
    c.tags,
    1 - (c.embedding <=> p_embedding) as vector_score
  from chunks c
  join sources s on s.id = c.source_id
  where s.user_id = p_user_id
    and c.source_id = any(p_source_ids)
  order by c.embedding <=> p_embedding
  limit p_top_k;
end;
$$;
