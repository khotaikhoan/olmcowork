
-- Extensions for cloud scheduling
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Job type enum
do $$ begin
  create type public.job_type as enum ('local', 'cloud');
exception when duplicate_object then null; end $$;

create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  cron text not null,
  prompt text not null,
  model text,
  job_type public.job_type not null default 'cloud',
  tools_enabled boolean not null default false,
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scheduled_jobs enable row level security;

create policy "own jobs select" on public.scheduled_jobs for select using (auth.uid() = user_id);
create policy "own jobs insert" on public.scheduled_jobs for insert with check (auth.uid() = user_id);
create policy "own jobs update" on public.scheduled_jobs for update using (auth.uid() = user_id);
create policy "own jobs delete" on public.scheduled_jobs for delete using (auth.uid() = user_id);

create trigger scheduled_jobs_set_updated_at
  before update on public.scheduled_jobs
  for each row execute function public.update_updated_at_column();

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.scheduled_jobs(id) on delete cascade,
  user_id uuid not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  output text,
  error text
);

alter table public.job_runs enable row level security;

create policy "own runs select" on public.job_runs for select using (auth.uid() = user_id);
create policy "own runs insert" on public.job_runs for insert with check (auth.uid() = user_id);

create index if not exists job_runs_job_id_idx on public.job_runs(job_id, started_at desc);
create index if not exists scheduled_jobs_user_idx on public.scheduled_jobs(user_id, enabled);
