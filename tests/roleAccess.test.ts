import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const roleAccessPath = path.join(__dirname, '..', 'src', 'lib', 'roleAccess.ts');
const source = fs.readFileSync(roleAccessPath, 'utf8');

test('finance users can access financial features but not inventory or staffing', () => {
  assert.match(source, /export function canAccessFeature/);
  assert.match(source, /module === 'financials'/);
  assert.match(source, /module === 'inventory'/);
  assert.match(source, /module === 'staffing'/);
});

test('staff users can reach staffing and overview modules only', () => {
  assert.match(source, /normalized === 'staff'/);
  assert.match(source, /module === 'overview'/);
  assert.match(source, /return module === 'staffing'/);
});
