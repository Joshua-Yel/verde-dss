alter table public.businesses
  add column if not exists settings jsonb not null default '{}'::jsonb;

create index if not exists businesses_settings_idx
  on public.businesses using gin (settings);
