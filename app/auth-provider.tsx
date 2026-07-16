"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";

const AuthContext = createContext<{ session: Session | null; loading: boolean }>({
  session: null,
  loading: true,
});

function isRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = "message" in error && typeof error.message === "string" ? error.message.toLowerCase() : "";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";

  return code === "refresh_token_not_found" || message.includes("refresh token") || message.includes("invalid refresh token");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let isMounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        setSession(nextSession);
        setLoading(false);
      }
    });

    const initializeSession = async () => {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (error && isRefreshTokenError(error)) {
          await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
          setSession(null);
        } else {
          setSession(currentSession);
        }
      } catch (error) {
        if (!isMounted) return;

        if (isRefreshTokenError(error)) {
          await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
          setSession(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void initializeSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const isAuthRoute = pathname === "/login" || pathname === "/signup";

    if (session && isAuthRoute) {
      router.replace("/");
    } else if (!session && !isAuthRoute) {
      router.replace("/login");
    }
  }, [loading, session, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
