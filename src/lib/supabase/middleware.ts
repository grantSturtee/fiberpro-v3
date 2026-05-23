import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/lib/auth/roles";

// ---------------------------------------------------------------------------
// Route access map — which roles may enter each area
// ---------------------------------------------------------------------------
const ROUTE_ROLE_MAP: { prefix: string; allowed: UserRole[] }[] = [
  { prefix: "/admin",    allowed: ["admin"] },
  { prefix: "/designer", allowed: ["designer"] },
  { prefix: "/company",  allowed: ["company_admin", "project_manager"] },
];

// Routes that are always public (no auth required)
const PUBLIC_PREFIXES = ["/sign-in", "/_next", "/favicon.ico"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// ---------------------------------------------------------------------------
// updateSession — refreshes the Supabase session cookie and enforces routing
// ---------------------------------------------------------------------------
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims;

  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    if (pathname === "/sign-in" && user) {
      const role = user.app_metadata?.role as UserRole | undefined;
      const dest = roleHome(role);
      if (dest) {
        return NextResponse.redirect(new URL(dest, request.url));
      }
    }
    return supabaseResponse;
  }

  if (pathname === "/") {
    if (!user) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
    const role = user.app_metadata?.role as UserRole | undefined;
    const dest = roleHome(role) ?? "/sign-in";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  const role = user.app_metadata?.role as UserRole | undefined;

  for (const route of ROUTE_ROLE_MAP) {
    if (!pathname.startsWith(route.prefix)) continue;

    if (!role || !route.allowed.includes(role)) {
      const home = roleHome(role) ?? "/sign-in";
      return NextResponse.redirect(new URL(home, request.url));
    }
    break;
  }

  return supabaseResponse;
}

function roleHome(role: UserRole | undefined): string | undefined {
  if (role === "admin") return "/admin";
  if (role === "designer") return "/designer";
  if (role === "company_admin" || role === "project_manager") return "/company";
  return undefined;
}
