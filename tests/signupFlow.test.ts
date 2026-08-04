import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signupRoutePath = path.join(__dirname, '..', 'app', 'api', 'auth', 'signup', 'route.ts');
const source = fs.readFileSync(signupRoutePath, 'utf8');

test('signup no longer auto-creates a business/workspace during registration', () => {
  assert.doesNotMatch(source, /createBusiness\(/);
  assert.doesNotMatch(source, /from '\@\/src\/lib\/adminAccess'/);
});
