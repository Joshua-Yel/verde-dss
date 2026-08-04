import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBusinessIdForUser } from '../src/lib/businessAccess.ts';

test('resolveBusinessIdForUser falls back to a single existing workspace when no explicit membership is present', async () => {
  const client = {
    from(table: string) {
      if (table === 'workspace_members') {
        return {
          select(columns: string) {
            assert.equal(columns, 'workspace_id');
            return {
              eq(column: string, value: string) {
                assert.equal(column, 'user_id');
                assert.equal(value, 'user-456');
                return {
                  eq(column2: string, value2: boolean) {
                    assert.equal(column2, 'is_active');
                    assert.equal(value2, true);
                    return {
                      limit(count: number) {
                        assert.equal(count, 1);
                        return Promise.resolve({ data: [], error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'user_profiles') {
        return {
          select(columns: string) {
            assert.equal(columns, 'workspace_id');
            return {
              eq(column: string, value: string) {
                assert.equal(column, 'id');
                assert.equal(value, 'user-456');
                return {
                  limit(count: number) {
                    assert.equal(count, 1);
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'businesses') {
        return {
          select(columns: string) {
            assert.equal(columns, 'id');
            return {
              limit(count: number) {
                assert.equal(count, 1);
                return Promise.resolve({ data: [{ id: 'workspace-123' }], error: null });
              },
              eq(column: string, value: string) {
                if (column === 'id') {
                  return {
                    limit(count: number) {
                      assert.equal(count, 1);
                      return Promise.resolve({ data: [{ id: 'workspace-123' }], error: null });
                    },
                  };
                }

                if (column === 'owner_id') {
                  return {
                    limit(count: number) {
                      assert.equal(count, 1);
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                }

                return {
                  limit(count: number) {
                    assert.equal(count, 1);
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const resolved = await resolveBusinessIdForUser(client as never, { id: 'user-456' } as never);
  assert.equal(resolved, 'workspace-123');
});

test('resolveBusinessIdForUser falls back to workspace memberships when the user does not own a business', async () => {
  const workspaceMemberships = [
    { workspace_id: 'workspace-123', user_id: 'user-456', is_active: true },
  ];

  const client = {
    from(table: string) {
      if (table === 'workspace_members') {
        return {
          select(columns: string) {
            assert.equal(columns, 'workspace_id');
            return {
              eq(column: string, value: string) {
                assert.equal(column, 'user_id');
                assert.equal(value, 'user-456');
                return {
                  eq(column2: string, value2: boolean) {
                    assert.equal(column2, 'is_active');
                    assert.equal(value2, true);
                    return {
                      limit(count: number) {
                        assert.equal(count, 1);
                        return Promise.resolve({ data: workspaceMemberships, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'businesses') {
        return {
          select(columns: string) {
            assert.equal(columns, 'id');
            return {
              eq(column: string, value: string) {
                assert.equal(column, 'id');
                assert.equal(value, 'workspace-123');
                return {
                  limit(count: number) {
                    assert.equal(count, 1);
                    return Promise.resolve({ data: [{ id: 'workspace-123' }], error: null });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const resolved = await resolveBusinessIdForUser(client as never, { id: 'user-456' } as never);
  assert.equal(resolved, 'workspace-123');
});
