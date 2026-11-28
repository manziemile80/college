/**
 * Shared auth helpers for Supabase Edge Functions.
 * Deno-compatible: uses only global fetch/Web APIs, no npm imports.
 */

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when the value is a canonical UUID string. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-cron-secret",
};

/** Build a JSON Response with permissive CORS defaults. */
export function json(
  body: unknown,
  status = 200,
  extra: HeadersInit = {},
): Response {
  const headers = new Headers(extra);
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

function baseUrl(supabaseUrl: string): string {
  return supabaseUrl.replace(/\/+$/, "");
}

/**
 * Verify a caller's bearer token with Supabase Auth and return the user.
 * Returns null for a missing/invalid/expired token. Never trusts unverified claims.
 */
export async function getUser(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<AuthUser | null> {
  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) return null;

  try {
    const response = await fetch(`${baseUrl(supabaseUrl)}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    // GoTrue's /user endpoint returns the user object directly; some clients wrap it.
    const user = payload?.user ?? payload;
    if (!user || typeof user.id !== "string" || !user.id) return null;
    return user as AuthUser;
  } catch (error) {
    console.error("getUser: token verification failed", error);
    return null;
  }
}

/**
 * Check the caller's roles against public.user_roles via PostgREST using the
 * service role key. This is a DB check, not a claim decoded from the JWT.
 */
export async function userHasRole(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  roles: string[],
): Promise<boolean> {
  if (!isUuid(userId) || !Array.isArray(roles) || roles.length === 0) return false;
  const encodedRoles = roles
    .filter((role): role is string => typeof role === "string" && role.length > 0)
    .map((role) => encodeURIComponent(role));
  if (encodedRoles.length === 0) return false;

  const url =
    `${baseUrl(supabaseUrl)}/rest/v1/user_roles` +
    `?select=role&user_id=eq.${encodeURIComponent(userId)}` +
    `&role=in.(${encodedRoles.join(",")})`;

  try {
    const response = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      console.error("userHasRole: lookup failed", response.status);
      return false;
    }
    const rows = await response.json().catch(() => null);
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    console.error("userHasRole: lookup error", error);
    return false;
  }
}

/**
 * Return a 401/403 Response when the user is missing or lacks one of `roles`,
 * otherwise null. Pass a custom `message` for endpoint-specific 403 text.
 */
export async function requireRole(
  user: AuthUser | null,
  supabaseUrl: string,
  serviceKey: string,
  roles: string[],
  message = "Forbidden: insufficient privileges",
): Promise<Response | null> {
  if (!user) return json({ error: "Unauthorized: please sign in" }, 401);
  const allowed = await userHasRole(supabaseUrl, serviceKey, user.id, roles);
  if (!allowed) return json({ error: message }, 403);
  return null;
}

/**
 * Validate the shared secret used for trusted server-to-server calls.
 * Returns a 403 Response when the header is missing, the secret is unset, or
 * the values do not match; returns null when valid.
 */
export function requireInternalSecret(req: Request): Response | null {
  const expected = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const provided = req.headers.get("x-internal-secret");
  if (!expected || !provided || provided !== expected) {
    return json({ error: "Forbidden: invalid internal secret" }, 403);
  }
  return null;
}
