create table if not exists public.kryvell_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.kryvell_users(id) on delete cascade,
  device_id uuid references public.kryvell_devices(id) on delete set null,
  session_hash text not null unique,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_kryvell_sessions_user_status on public.kryvell_sessions(user_id, status);
create index if not exists idx_kryvell_sessions_expires on public.kryvell_sessions(expires_at);

alter table public.kryvell_sessions enable row level security;

-- No anon/public policy: KRYVELL server routes are intended to use the service role.
