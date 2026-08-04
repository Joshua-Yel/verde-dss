-- VERDE SUPABASE INITIALIZATION SCRIPT
-- Production-ready schema for the current Verde implementation.
-- This script is idempotent and designed for a fresh Supabase project.

create extension if not exists pgcrypto;

create schema if not exists public;

-- -----------------------------------------------------------------------------
-- Core workspace model
-- -----------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete set null,
  currency text not null default 'PHP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  salon_name text,
  role text not null default 'user' check (role in ('owner','admin','finance','inventory','staff','user')),
  is_admin boolean not null default false,
  is_active boolean not null default true,
  workspace_id uuid references public.businesses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('owner','admin','finance','inventory','staff','user')),
  is_active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create unique index if not exists workspace_members_single_active_membership
  on public.workspace_members (user_id)
  where is_active;

create index if not exists workspace_members_workspace_idx on public.workspace_members (workspace_id);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

-- -----------------------------------------------------------------------------
-- Operational data tables used by Verde
-- -----------------------------------------------------------------------------
create table if not exists public.services (
  id bigserial primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  category text,
  price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_operations (
  id bigserial primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id bigint references public.services(id) on delete set null,
  date date not null,
  quantity int,
  revenue numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.raw_imports (
  id bigserial primary key,
  business_id uuid references public.businesses(id) on delete cascade,
  filename text,
  data jsonb,
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id bigserial primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  supplier text,
  stock int not null default 0,
  reorder_point int not null default 0,
  unit_cost numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forecast_snapshots (
  id bigserial primary key,
  business_id uuid references public.businesses(id) on delete cascade,
  method text,
  params jsonb,
  results jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists services_business_idx on public.services (business_id);
create index if not exists operations_business_date_idx on public.daily_operations (business_id, date);
create index if not exists operations_service_idx on public.daily_operations (service_id);
create index if not exists inventory_business_idx on public.inventory_items (business_id);
create index if not exists raw_imports_business_idx on public.raw_imports (business_id, created_at desc);
create index if not exists forecast_snapshots_business_idx on public.forecast_snapshots (business_id, created_at desc);
create index if not exists businesses_owner_idx on public.businesses (owner_id);
create index if not exists user_profiles_workspace_idx on public.user_profiles (workspace_id);

-- -----------------------------------------------------------------------------
-- Helper functions for RBAC and workspace access
-- -----------------------------------------------------------------------------
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.is_active
      and (up.is_admin = true or up.role = 'admin')
  );
$$;

create or replace function public.current_user_workspace_role(p_workspace_id uuid)
returns text
language sql
stable
security definer
as $$
  select case
    when public.current_user_is_admin() then 'admin'
    else coalesce(
      (
        select wm.role
        from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = auth.uid()
          and wm.is_active
        order by wm.created_at desc
        limit 1
      ),
      'none'
    )
  end;
$$;

create or replace function public.current_user_can_access_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select public.current_user_is_admin()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active
    );
$$;

create or replace function public.current_user_can_manage_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select public.current_user_is_admin()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active
        and wm.role in ('owner', 'admin')
    );
$$;

create or replace function public.current_user_can_access_module(p_workspace_id uuid, p_module text)
returns boolean
language sql
stable
security definer
as $$
  select public.current_user_is_admin() or (
    case public.current_user_workspace_role(p_workspace_id)
      when 'owner' then true
      when 'admin' then true
      when 'finance' then p_module in ('overview', 'financials')
      when 'inventory' then p_module in ('overview', 'inventory')
      when 'staff' then p_module in ('overview', 'staffing')
      when 'user' then p_module in ('overview', 'service-demand', 'inventory', 'financials', 'staffing')
      else false
    end
  );
$$;

-- -----------------------------------------------------------------------------
-- Auth/user synchronization
-- -----------------------------------------------------------------------------
create or replace function public.sync_user_profile_from_auth()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    full_name,
    salon_name,
    role,
    is_admin,
    is_active,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'salon_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'salon_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'role', new.raw_app_meta_data->>'role', 'user'),
    coalesce((new.raw_app_meta_data->>'is_admin')::boolean, false),
    true,
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    salon_name = excluded.salon_name,
    role = excluded.role,
    is_admin = excluded.is_admin,
    is_active = excluded.is_active,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_user_profile_from_auth on auth.users;
create trigger trg_sync_user_profile_from_auth
  after insert or update on auth.users
  for each row execute function public.sync_user_profile_from_auth();

create or replace function public.sync_workspace_membership_profile()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.user_id is not null then
    update public.user_profiles
    set workspace_id = new.workspace_id,
        role = case
          when new.role = 'owner' then 'owner'
          when new.role = 'admin' then 'admin'
          when new.role = 'finance' then 'finance'
          when new.role = 'inventory' then 'inventory'
          when new.role = 'staff' then 'staff'
          else 'user'
        end,
        updated_at = now()
    where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_workspace_membership_profile on public.workspace_members;
create trigger trg_sync_workspace_membership_profile
  after insert or update of workspace_id, role on public.workspace_members
  for each row execute function public.sync_workspace_membership_profile();

-- -----------------------------------------------------------------------------
-- Enable RLS
-- -----------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.user_profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.services enable row level security;
alter table public.daily_operations enable row level security;
alter table public.raw_imports enable row level security;
alter table public.inventory_items enable row level security;
alter table public.forecast_snapshots enable row level security;

-- -----------------------------------------------------------------------------
-- RLS policies
-- -----------------------------------------------------------------------------

drop policy if exists businesses_select on public.businesses;
drop policy if exists businesses_manage on public.businesses;
drop policy if exists businesses_insert on public.businesses;
drop policy if exists businesses_delete on public.businesses;

create policy businesses_select on public.businesses
  for select
  using (public.current_user_can_access_workspace(id));

create policy businesses_insert on public.businesses
  for insert
  with check (auth.uid() is not null and owner_id = auth.uid() and public.current_user_is_admin());

create policy businesses_manage on public.businesses
  for update
  using (public.current_user_can_manage_workspace(id))
  with check (public.current_user_can_manage_workspace(id));

create policy businesses_delete on public.businesses
  for delete
  using (public.current_user_can_manage_workspace(id));


drop policy if exists user_profiles_select on public.user_profiles;
drop policy if exists user_profiles_update on public.user_profiles;
drop policy if exists user_profiles_manage on public.user_profiles;

create policy user_profiles_select on public.user_profiles
  for select
  using (
    id = auth.uid()
    or public.current_user_is_admin()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = public.user_profiles.workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active
    )
  );

create policy user_profiles_update on public.user_profiles
  for update
  using (id = auth.uid() or public.current_user_can_manage_workspace(workspace_id))
  with check (id = auth.uid() or public.current_user_can_manage_workspace(workspace_id));


drop policy if exists workspace_members_select on public.workspace_members;
drop policy if exists workspace_members_manage on public.workspace_members;
drop policy if exists workspace_members_update on public.workspace_members;
drop policy if exists workspace_members_delete on public.workspace_members;

create policy workspace_members_select on public.workspace_members
  for select
  using (
    public.current_user_can_manage_workspace(workspace_id)
    or user_id = auth.uid()
  );

create policy workspace_members_manage on public.workspace_members
  for insert
  with check (public.current_user_can_manage_workspace(workspace_id));

create policy workspace_members_update on public.workspace_members
  for update
  using (public.current_user_can_manage_workspace(workspace_id))
  with check (public.current_user_can_manage_workspace(workspace_id));

create policy workspace_members_delete on public.workspace_members
  for delete
  using (public.current_user_can_manage_workspace(workspace_id));


drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select
  using (
    public.current_user_can_access_module(business_id, 'overview')
    or public.current_user_can_access_module(business_id, 'service-demand')
    or public.current_user_can_access_module(business_id, 'staffing')
  );


drop policy if exists operations_select on public.daily_operations;
create policy operations_select on public.daily_operations
  for select
  using (
    public.current_user_can_access_module(business_id, 'overview')
    or public.current_user_can_access_module(business_id, 'service-demand')
    or public.current_user_can_access_module(business_id, 'financials')
    or public.current_user_can_access_module(business_id, 'staffing')
  );


drop policy if exists raw_imports_select on public.raw_imports;
drop policy if exists raw_imports_manage on public.raw_imports;
drop policy if exists raw_imports_update on public.raw_imports;
create policy raw_imports_select on public.raw_imports
  for select
  using (public.current_user_can_manage_workspace(business_id));

create policy raw_imports_manage on public.raw_imports
  for insert
  with check (public.current_user_can_manage_workspace(business_id));

create policy raw_imports_update on public.raw_imports
  for update
  using (public.current_user_can_manage_workspace(business_id))
  with check (public.current_user_can_manage_workspace(business_id));


drop policy if exists inventory_select on public.inventory_items;
create policy inventory_select on public.inventory_items
  for select
  using (
    public.current_user_can_access_module(business_id, 'overview')
    or public.current_user_can_access_module(business_id, 'inventory')
  );

drop policy if exists inventory_manage on public.inventory_items;
create policy inventory_manage on public.inventory_items
  for insert
  with check (public.current_user_can_manage_workspace(business_id));

create policy inventory_update on public.inventory_items
  for update
  using (public.current_user_can_manage_workspace(business_id))
  with check (public.current_user_can_manage_workspace(business_id));

create policy inventory_delete on public.inventory_items
  for delete
  using (public.current_user_can_manage_workspace(business_id));


drop policy if exists forecast_snapshots_select on public.forecast_snapshots;
create policy forecast_snapshots_select on public.forecast_snapshots
  for select
  using (
    public.current_user_can_access_module(business_id, 'overview')
    or public.current_user_can_access_module(business_id, 'service-demand')
    or public.current_user_can_access_module(business_id, 'financials')
    or public.current_user_can_access_module(business_id, 'staffing')
  );

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on public.businesses to authenticated;
grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select on public.services to authenticated;
grant select on public.daily_operations to authenticated;
grant select, insert, update, delete on public.raw_imports to authenticated;
grant select, insert, update, delete on public.inventory_items to authenticated;
grant select on public.forecast_snapshots to authenticated;

-- -----------------------------------------------------------------------------
-- Helpful defaults for a new installation
-- -----------------------------------------------------------------------------
create or replace view public.workspace_membership_summary as
select
  b.id as workspace_id,
  b.name as workspace_name,
  b.owner_id,
  wm.user_id,
  wm.role,
  wm.is_active
from public.businesses b
left join public.workspace_members wm on wm.workspace_id = b.id;
