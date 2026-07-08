-- Core schema for Decision Support System (run in Supabase SQL editor)

-- businesses
create table if not exists businesses (
  id uuid primary key,
  name text,
  created_at timestamptz default now()
);

-- services
create table if not exists services (
  id bigserial primary key,
  business_id uuid references businesses(id) on delete cascade,
  name text,
  category text,
  price numeric,
  created_at timestamptz default now()
);

-- daily operations (time series)
create table if not exists daily_operations (
  id bigserial primary key,
  business_id uuid references businesses(id) on delete cascade,
  service_id bigint references services(id),
  date date not null,
  quantity int,
  revenue numeric,
  created_at timestamptz default now()
);

-- raw imports (stores uploaded JSON for audit)
create table if not exists raw_imports (
  id bigserial primary key,
  filename text,
  data jsonb,
  created_at timestamptz default now()
);

-- inventory items
create table if not exists inventory_items (
  id bigserial primary key,
  business_id uuid references businesses(id) on delete cascade,
  name text not null,
  supplier text,
  stock int default 0,
  reorder_point int default 0,
  unit_cost numeric default 0,
  created_at timestamptz default now()
);

-- forecast snapshots (basic)
create table if not exists forecast_snapshots (
  id bigserial primary key,
  business_id uuid,
  method text,
  params jsonb,
  results jsonb,
  created_at timestamptz default now()
);
