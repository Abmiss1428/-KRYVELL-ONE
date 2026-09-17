create extension if not exists pgcrypto;

create table if not exists public.kryvell_users (
  id text primary key,
  phone_fingerprint text unique,
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  tier text not null default 'free' check (tier in ('free','go','plus','premium','pro','business')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.kryvell_identities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.kryvell_users(id) on delete cascade,
  provider text not null,
  provider_subject_hash text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_subject_hash)
);

create table if not exists public.kryvell_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.kryvell_users(id) on delete cascade,
  device_key text not null,
  platform text,
  push_token_hash text,
  trusted boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique(user_id, device_key)
);

create table if not exists public.kryvell_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.kryvell_users(id) on delete cascade,
  tier text not null check (tier in ('free','go','plus','premium','pro','business')),
  source text not null default 'kryvell',
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kryvell_audit_events (
  id bigserial primary key,
  user_id text references public.kryvell_users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_kryvell_users_last_seen on public.kryvell_users(last_seen_at desc);
create index if not exists idx_kryvell_identities_user on public.kryvell_identities(user_id);
create index if not exists idx_kryvell_devices_user on public.kryvell_devices(user_id);
create index if not exists idx_kryvell_entitlements_user on public.kryvell_entitlements(user_id, status);
create index if not exists idx_kryvell_audit_user_created on public.kryvell_audit_events(user_id, created_at desc);

alter table public.kryvell_users enable row level security;
alter table public.kryvell_identities enable row level security;
alter table public.kryvell_devices enable row level security;
alter table public.kryvell_entitlements enable row level security;
alter table public.kryvell_audit_events enable row level security;

-- No anon/public policies are created here. KRYVELL server routes use the service role.
-- Airtable remains the ACStudio control plane/canon source; these tables are for high-volume app users.
