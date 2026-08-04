import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlPath = path.join(__dirname, '..', 'sql', '003_production_schema.sql');
const source = fs.readFileSync(sqlPath, 'utf8');

test('registration schema no longer auto-creates workspace memberships on business creation', () => {
  assert.doesNotMatch(source, /create or replace function public\.ensure_workspace_owner_membership\(\)/);
  assert.doesNotMatch(source, /trg_ensure_workspace_owner_membership/);
  assert.doesNotMatch(source, /insert into public\.workspace_members \(workspace_id, user_id, role, is_active, created_at, updated_at\)/);
});
