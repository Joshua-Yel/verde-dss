Applying the index migration to production (Supabase)

Option A — Supabase SQL Editor (recommended for most users):

1. Open your Supabase project dashboard.
2. Navigate to `SQL` → `New query`.
3. Paste the contents of `sql/004_indexes_migration.sql` and run the query.

Option B — psql (service role / direct DB connection):
Set the `DATABASE_URL` or use the service role connection string, then run:

```bash
psql "$DATABASE_URL" -f sql/004_indexes_migration.sql
```

Notes and safety:

- Index creation can take time and may lock depending on your Postgres version and settings. Prefer running during low traffic.
- On very large tables, consider creating indexes concurrently:
  - `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table (column);`
  - Supabase SQL editor may not allow `CONCURRENTLY` in some environments; use a direct psql connection for concurrent creation.
- Monitor `pg_stat_activity` and `pg_stat_progress_create_index` (if available) while creating indexes.
- If you rely on Supabase row-level security, these indexes do not change policies — they only speed lookups.

If you want, I can generate `CONCURRENTLY` variants and a small step-by-step script for psql that checks progress and falls back safely.
