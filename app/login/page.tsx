"use client";

import { useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

const TODAY = new Date().toLocaleDateString("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="flex-1 flex">
        {/* Spine — the bound edge of the ledger */}
        <aside className="w-10 sm:w-14 shrink-0 bg-primary flex flex-col items-center justify-between py-6">
          <span className="text-primary-foreground text-xs font-semibold">V</span>
          <span
            className="text-primary-foreground/70 text-[10px] font-mono uppercase tracking-[0.2em] [writing-mode:vertical-rl]"
          >
            Verde — Operations Log
          </span>
          <span className="text-primary-foreground/50 text-[10px] font-mono">No. 01</span>
        </aside>

        <main className="flex-1 flex items-start justify-center px-6 py-8 sm:py-14">
          <div className="w-full max-w-xl">
            <header className="flex items-center justify-between mb-10">
              <span className="text-sm font-semibold tracking-tight text-foreground">VERDE</span>
              <Link
                href="/signup"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                New here? Sign up
              </Link>
            </header>

            {/* Record header */}
            <div className="flex items-baseline justify-between gap-4 pb-5 border-b border-border">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
                  Session
                </p>
                <h1 className="font-serif text-[1.7rem] leading-tight text-foreground">
                  Welcome back.
                </h1>
              </div>
              <p className="hidden sm:block text-xs font-mono text-muted-foreground/70 whitespace-nowrap pb-1">
                Today — {TODAY}
              </p>
            </div>

            <p className="text-sm text-muted-foreground mt-4 mb-8">
              Pick up where you left off.
            </p>

            <form onSubmit={handleSignIn}>
              <div className="divide-y divide-border border-b border-border">
                {/* Email row */}
                <div className="grid grid-cols-[9rem_1fr] sm:grid-cols-[11rem_1fr] items-center gap-4 py-4">
                  <label
                    htmlFor="email"
                    className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted-foreground"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    className="w-full bg-transparent border-0 rounded-none px-0 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
                  />
                </div>

                {/* Password row */}
                <div className="grid grid-cols-[9rem_1fr] sm:grid-cols-[11rem_1fr] items-center gap-4 py-4">
                  <label
                    htmlFor="password"
                    className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted-foreground"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-transparent border-0 rounded-none px-0 py-1 pr-8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                          <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                          <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1  4.446-5.143" />
                          <path d="m2 2 20 20" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border px-3.5 py-2.5 text-xs bg-[var(--danger-light)] text-[var(--danger)] border-[var(--danger)] mt-5">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between gap-4 mt-7">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                >
                  {loading && (
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {loading ? "Signing in…" : "Sign in"}
                </button>
                <p className="text-xs text-muted-foreground/70">
                  Access is scoped to your workspace.
                </p>
              </div>
            </form>
          </div>
        </main>
      </div>

      <p className="text-center text-[11px] font-mono text-muted-foreground/50 py-6">
        © {new Date().getFullYear()} VERDE
      </p>
    </div>
  );
}