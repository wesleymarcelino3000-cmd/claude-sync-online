-- Presença automática dos agentes locais
create table if not exists public.agent_presence (
  agent_id text primary key,
  account text not null check (account in ('Claude normal','Claude Gateway')),
  project_name text not null default '',
  repo_url text not null default '',
  branch text not null default '',
  status text not null default 'paused' check (status in ('working','paused','offline')),
  changed_files jsonb not null default '[]'::jsonb,
  files_count integer not null default 0,
  last_commit text not null default '',
  last_activity_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.agent_presence enable row level security;
drop policy if exists "authenticated can read agent presence" on public.agent_presence;
create policy "authenticated can read agent presence"
on public.agent_presence for select
to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.agent_presence;
exception
  when duplicate_object then null;
end $$;
