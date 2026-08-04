import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dashboardPath = path.join(__dirname, '..', 'app', 'admin', 'AdminDashboardClient.tsx');
const source = fs.readFileSync(dashboardPath, 'utf8');

test('admin dashboard exposes workspace selection when creating a user', () => {
  assert.match(source, /workspaceId/i);
  assert.match(source, /body:\s*JSON\.stringify\(newUserForm\)/);
});
