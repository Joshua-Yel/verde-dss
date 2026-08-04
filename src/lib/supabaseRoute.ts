import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseRouteClient() {
  const cookieStore = await cookies();
  try {
    const names = cookieStore.getAll().map((c) => c.name);
    console.debug('[supabaseRoute] incoming cookies:', names);
  } catch (err) {
    try { console.debug('[supabaseRoute] could not read incoming cookies', err); } catch {}
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

// Lightweight instrumentation wrapper for route clients. This wraps `from()` calls
// and times query builder terminal methods (select/insert/update/delete) and
// logs duplicates detected within a short window. Uses console.debug so it can
// be enabled in logs without polluting stdout in production by default.
export async function createInstrumentedSupabaseRouteClient() {
  const client = await createSupabaseRouteClient();

  const recent = new Map<string, number>();
  const DUP_WINDOW_MS = 2000;

  const makeSignature = (table: string, method: string, args: unknown[]) => {
    try {
      return `${table}:${method}:${JSON.stringify(args)}`;
    } catch {
      return `${table}:${method}:unserializable`;
    }
  };

  const handler: ProxyHandler<unknown> = {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (prop === 'from' && typeof orig === 'function') {
        return function (table: string) {
          const builder = orig.apply(target, [table]);

          const builderProxy = new Proxy(builder, {
            get(bTarget, bProp) {
              const fn = Reflect.get(bTarget, bProp);
              if (typeof fn === 'function' && ['select', 'insert', 'update', 'delete', 'upsert'].includes(String(bProp))) {
                return async function (...args: unknown[]) {
                  const sig = makeSignature(table, String(bProp), args);
                  const start = Date.now();
                  try {
                    const res = await fn.apply(bTarget, args);
                    const elapsed = Date.now() - start;
                    // log slow queries > 500ms and duplicates
                    if (elapsed > 500) console.debug('[supabase][slow]', { table, method: String(bProp), elapsed, sig });
                    const last = recent.get(sig) ?? 0;
                    if (Date.now() - last < DUP_WINDOW_MS) {
                      console.debug('[supabase][dup]', { table, method: String(bProp), elapsed, sig });
                    }
                    recent.set(sig, Date.now());
                    // cleanup old entries lazily
                    for (const [k, ts] of recent) if (Date.now() - ts > DUP_WINDOW_MS * 3) recent.delete(k);
                    return res;
                  } catch (err) {
                    const elapsed = Date.now() - start;
                    console.debug('[supabase][error]', { table, method: String(bProp), elapsed, error: err });
                    throw err;
                  }
                };
              }
              return fn;
            },
          });

          return builderProxy;
        };
      }

      return orig;
    },
  };

  return new Proxy(client, handler);
}