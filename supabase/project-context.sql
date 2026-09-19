-- Memória central do projeto ShipFlow
create table if not exists public.project_context (
  id text primary key,
  summary text not null default '',
  current_state text not null default '',
  last_change text not null default '',
  changed_files jsonb not null default '[]'::jsonb,
  blockers text not null default '',
  next_step text not null default '',
  commit_sha text not null default '',
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.project_context enable row level security;
drop policy if exists "authenticated can read project context" on public.project_context;
drop policy if exists "authenticated can insert project context" on public.project_context;
drop policy if exists "authenticated can update project context" on public.project_context;
create policy "authenticated can read project context" on public.project_context for select to authenticated using (true);
create policy "authenticated can insert project context" on public.project_context for insert to authenticated with check (true);
create policy "authenticated can update project context" on public.project_context for update to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.project_context;
