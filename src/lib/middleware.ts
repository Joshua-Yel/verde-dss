import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = "message" in error && typeof error.message === "string" ? error.message.toLowerCase() : "";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";

  return code === "refresh_token_not_found" || message.includes("refresh token") || message.includes("invalid refresh token");
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  request.cookies.getAll().forEach(({ name }) => {
    if (name.startsWith("sb-") || name.includes("supabase")) {
      response.cookies.set(name, "", {
        maxAge: 0,
        path: "/",
      });
    }
  });
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  try {
    const { error } = await supabase.auth.getUser();

    if (error && isRefreshTokenError(error)) {
      clearSupabaseAuthCookies(request, response);
    }
  } catch (error) {
    if (isRefreshTokenError(error)) {
      clearSupabaseAuthCookies(request, response);
    }
  }

  return response;
}