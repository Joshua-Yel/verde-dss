-- Migration: add helpful indexes to reduce table scans and speed lookups
-- Run this in Supabase SQL editor or via psql with service role credentials.

create index if not exists businesses_owner_idx on public.businesses (owner_id);
create index if not exists user_profiles_workspace_idx on public.user_profiles (workspace_id);
create index if not exists workspace_members_user_active_idx on public.workspace_members (user_id, is_active);
create index if not exists raw_imports_business_created_idx on public.raw_imports (business_id, created_at desc);

-- Optional: If you have frequent queries filtering by imported_by, index that column as well.
create index if not exists raw_imports_imported_by_idx on public.raw_imports (imported_by);

-- Notes:
-- Applying indexes is usually fast but can take time on very large tables; schedule during low-traffic window if possible.
-- Supabase SQL editor will run these as the service role.
