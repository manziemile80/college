/**
 * Admin-only user management.
 * Uses the service role key only on the server; it is never returned to clients.
 * All authorization decisions are made from a verified JWT plus a DB role check.
 */
import { getUser, isUuid, json, requireRole } from "../_shared/auth.ts";

// Mirrors public.app_role (see the migrations). Adding a role requires a DB enum change.
const ALLOWED_ROLES = [
  "admin",
  "teacher",
  "dos",
  "dod",
  "parent",
  "student",
  "viewer",
  "stock_manager",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+0-9 ()-]{5,50}$/;

interface ApiResult {
  ok: boolean;
  status: number;
  data: any;
  headers: Headers;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_PATTERN.test(value);
}

function isValidName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200;
}

function isValidPhone(value: unknown): value is string {
  return typeof value === "string" && value.length <= 50 && PHONE_PATTERN.test(value);
}

function parseRoles(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > ALLOWED_ROLES.length) return null;
  const roles: string[] = [];
  for (const role of value) {
    if (typeof role !== "string" || !ALLOWED_ROLES.includes(role)) return null;
    if (!roles.includes(role)) roles.push(role);
  }
  return roles;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

async function readBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function errorMessage(data: any, status: number): string {
  const message =
    data?.msg ?? data?.message ?? data?.error?.message ?? data?.error ?? `Request failed (${status})`;
  return String(message).slice(0, 500);
}

function clientStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 500;
}

/** Call a Supabase Auth Admin REST endpoint with the service role key. */
async function authAdmin(
  supabaseUrl: string,
  serviceKey: string,
  path: string,
  init: RequestInit = {},
): Promise<ApiResult> {
  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin${path}`,
    {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    },
  );
  return {
    ok: response.ok,
    status: response.status,
    data: await readBody(response),
    headers: response.headers,
  };
}

/** Call a PostgREST endpoint with the service role key (bypasses RLS). */
async function rest(
  supabaseUrl: string,
  serviceKey: string,
  path: string,
  init: RequestInit = {},
): Promise<ApiResult> {
  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${path}`,
    {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    },
  );
  return {
    ok: response.ok,
    status: response.status,
    data: await readBody(response),
    headers: response.headers,
  };
}

/** Best-effort audit logging; never fail the requested action because logging failed. */
async function audit(
  supabaseUrl: string,
  serviceKey: string,
  adminId: string,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const result = await rest(supabaseUrl, serviceKey, "audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: adminId,
        action,
        entity,
        entity_id: entityId,
        details,
      }),
    });
    if (!result.ok) {
      console.error("Audit log insert failed", result.status, result.data);
    }
  } catch (error) {
    console.error("Audit log error", error);
  }
}

async function userExists(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<boolean> {
  const result = await rest(
    supabaseUrl,
    serviceKey,
    `profiles?select=user_id&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "GET" },
  );
  return result.ok && Array.isArray(result.data) && result.data.length > 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("Admin function is missing required environment variables");
      return json({ error: "Server is misconfigured" }, 500);
    }

    // 1) Verified JWT, 2) DB-backed admin role check (never trust JWT claims).
    const admin = await getUser(req, supabaseUrl, anonKey);
    const denied = await requireRole(admin, supabaseUrl, serviceKey, ["admin"]);
    if (denied) return denied;
    const adminId = admin!.id;

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!isPlainObject(parsed)) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      body = parsed;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const action = body.action;
    if (typeof action !== "string") {
      return json({ error: "Missing action" }, 400);
    }

    // -------------------------- create_user -------------------------------
    if (action === "create_user") {
      const email = body.email;
      const fullName = body.full_name;
      const password = body.password;
      if (!isValidEmail(email)) {
        return json({ error: "A valid email is required" }, 400);
      }
      if (!isValidName(fullName)) {
        return json({ error: "A valid full_name is required" }, 400);
      }
      if (
        password !== undefined &&
        (typeof password !== "string" || password.length < 8 || password.length > 128)
      ) {
        return json({ error: "password must be between 8 and 128 characters" }, 400);
      }
      const roles = parseRoles(body.roles);
      if (!roles) {
        return json({ error: "roles must be an array of supported roles" }, 400);
      }

      const created = await authAdmin(supabaseUrl, serviceKey, "/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          email_confirm: true,
          ...(typeof password === "string" ? { password } : {}),
          user_metadata: { full_name: fullName.trim() },
        }),
      });
      if (!created.ok) {
        return json({ error: errorMessage(created.data, created.status) }, clientStatus(created.status));
      }
      const userId: unknown = created.data?.user?.id ?? created.data?.id;
      if (!isUuid(userId)) {
        return json({ error: "Unexpected response from auth service" }, 500);
      }

      // The signup trigger creates a profile; upsert to apply the supplied name.
      const profile = await rest(supabaseUrl, serviceKey, "profiles", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: userId, full_name: fullName.trim(), email }),
      });
      if (!profile.ok) {
        console.error("Profile upsert failed", profile.status, profile.data);
      }
      if (roles.length > 0) {
        const roleResult = await rest(supabaseUrl, serviceKey, "user_roles", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify(roles.map((role) => ({ user_id: userId, role }))),
        });
        if (!roleResult.ok) {
          console.error("Role insert failed", roleResult.status, roleResult.data);
        }
      }

      await audit(supabaseUrl, serviceKey, adminId, "create_user", "auth.users", userId, {
        email,
        roles,
      });
      return json(
        {
          success: true,
          user: { id: userId, email, full_name: fullName.trim() },
          roles,
        },
        200,
      );
    }

    // -------------------------- update_user -------------------------------
    if (action === "update_user") {
      const userId = body.user_id;
      if (!isUuid(userId)) {
        return json({ error: "user_id must be a valid UUID" }, 400);
      }
      const profileUpdates: Record<string, string> = {};
      if (body.full_name !== undefined) {
        if (!isValidName(body.full_name)) {
          return json({ error: "full_name must be a non-empty string" }, 400);
        }
        profileUpdates.full_name = body.full_name.trim();
      }
      if (body.phone !== undefined && body.phone !== null && body.phone !== "") {
        if (!isValidPhone(body.phone)) {
          return json({ error: "phone must be a valid phone number" }, 400);
        }
        profileUpdates.phone = body.phone;
      } else if (body.phone === null || body.phone === "") {
        profileUpdates.phone = "";
      }
      let active: boolean | undefined;
      if (body.active !== undefined) {
        if (typeof body.active !== "boolean") {
          return json({ error: "active must be a boolean" }, 400);
        }
        active = body.active;
      }
      if (Object.keys(profileUpdates).length === 0 && active === undefined) {
        return json({ error: "No fields to update" }, 400);
      }
      if (userId === adminId && active === false) {
        return json({ error: "You cannot deactivate your own account" }, 400);
      }
      if (!(await userExists(supabaseUrl, serviceKey, userId))) {
        return json({ error: "User not found" }, 404);
      }

      if (Object.keys(profileUpdates).length > 0) {
        const updated = await rest(
          supabaseUrl,
          serviceKey,
          `profiles?user_id=eq.${encodeURIComponent(userId)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(profileUpdates),
          },
        );
        if (!updated.ok) {
          return json({ error: errorMessage(updated.data, updated.status) }, clientStatus(updated.status));
        }
      }
      if (active !== undefined) {
        const banned = await authAdmin(supabaseUrl, serviceKey, `/users/${userId}`, {
          method: "PUT",
          body: JSON.stringify({ ban_duration: active ? "none" : "876000h" }),
        });
        if (!banned.ok) {
          return json({ error: errorMessage(banned.data, banned.status) }, clientStatus(banned.status));
        }
      }

      await audit(supabaseUrl, serviceKey, adminId, "update_user", "auth.users", userId, {
        fields: Object.keys(profileUpdates),
        active,
      });
      return json({ success: true, user_id: userId, active: active ?? null }, 200);
    }

    // --------------------------- set_roles --------------------------------
    if (action === "set_roles") {
      const userId = body.user_id;
      if (!isUuid(userId)) {
        return json({ error: "user_id must be a valid UUID" }, 400);
      }
      const roles = parseRoles(body.roles);
      if (!roles) {
        return json({ error: "roles must be an array of supported roles" }, 400);
      }
      // Never let an admin strip their own admin role (lockout / privilege loss).
      if (userId === adminId && !roles.includes("admin")) {
        return json({ error: "You cannot remove your own admin role" }, 400);
      }
      if (!(await userExists(supabaseUrl, serviceKey, userId))) {
        return json({ error: "User not found" }, 404);
      }

      const removed = await rest(
        supabaseUrl,
        serviceKey,
        `user_roles?user_id=eq.${encodeURIComponent(userId)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
      if (!removed.ok) {
        return json({ error: errorMessage(removed.data, removed.status) }, clientStatus(removed.status));
      }
      if (roles.length > 0) {
        const inserted = await rest(supabaseUrl, serviceKey, "user_roles", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(roles.map((role) => ({ user_id: userId, role }))),
        });
        if (!inserted.ok) {
          return json({ error: errorMessage(inserted.data, inserted.status) }, clientStatus(inserted.status));
        }
      }

      await audit(supabaseUrl, serviceKey, adminId, "set_roles", "user_roles", userId, { roles });
      return json({ success: true, user_id: userId, roles }, 200);
    }

    // ------------------------- reset_password -----------------------------
    if (action === "reset_password") {
      const userId = body.user_id;
      if (!isUuid(userId)) {
        return json({ error: "user_id must be a valid UUID" }, 400);
      }
      const found = await authAdmin(supabaseUrl, serviceKey, `/users/${userId}`, {
        method: "GET",
      });
      if (found.status === 404) {
        return json({ error: "User not found" }, 404);
      }
      if (!found.ok) {
        return json({ error: errorMessage(found.data, found.status) }, clientStatus(found.status));
      }
      const email: unknown = found.data?.user?.email ?? found.data?.email;
      if (!isValidEmail(email)) {
        return json({ error: "User has no valid email address" }, 400);
      }

      // Equivalent to auth.admin.generateLink({ type: 'recovery' | 'invite' }).
      let linkResult = await authAdmin(supabaseUrl, serviceKey, "/generate_link", {
        method: "POST",
        body: JSON.stringify({ type: "recovery", email }),
      });
      let mode = "recovery";
      if (!linkResult.ok) {
        // Unconfirmed users cannot recover; an invite link is the fallback.
        mode = "invite";
        linkResult = await authAdmin(supabaseUrl, serviceKey, "/generate_link", {
          method: "POST",
          body: JSON.stringify({ type: "invite", email }),
        });
      }
      if (!linkResult.ok) {
        return json({ error: errorMessage(linkResult.data, linkResult.status) }, clientStatus(linkResult.status));
      }
      const actionLink: unknown =
        linkResult.data?.action_link ?? linkResult.data?.properties?.action_link;
      if (typeof actionLink !== "string" || !actionLink) {
        return json({ error: "Auth service did not return an action link" }, 500);
      }

      // The link is only returned to the verified admin caller and is never logged.
      await audit(supabaseUrl, serviceKey, adminId, "reset_password", "auth.users", userId, {
        mode,
      });
      return json({ success: true, action_link: actionLink, mode }, 200);
    }

    // --------------------------- delete_user ------------------------------
    if (action === "delete_user") {
      const userId = body.user_id;
      if (!isUuid(userId)) {
        return json({ error: "user_id must be a valid UUID" }, 400);
      }
      if (userId === adminId) {
        return json({ error: "You cannot delete your own account" }, 400);
      }
      if (!(await userExists(supabaseUrl, serviceKey, userId))) {
        return json({ error: "User not found" }, 404);
      }
      await audit(supabaseUrl, serviceKey, adminId, "delete_user", "auth.users", userId, {});
      const deleted = await authAdmin(supabaseUrl, serviceKey, `/users/${userId}`, {
        method: "DELETE",
        body: JSON.stringify({ should_soft_delete: false }),
      });
      if (!deleted.ok) {
        return json({ error: errorMessage(deleted.data, deleted.status) }, clientStatus(deleted.status));
      }
      return json({ success: true, user_id: userId }, 200);
    }

    // --------------------------- list_users -------------------------------
    if (action === "list_users") {
      const page = clampInt(body.page ?? 1, 1, 1, 100_000);
      const perPage = clampInt(body.perPage ?? 20, 20, 1, 100);
      const listed = await authAdmin(
        supabaseUrl,
        serviceKey,
        `/users?page=${page}&per_page=${perPage}`,
        { method: "GET" },
      );
      if (!listed.ok) {
        return json({ error: errorMessage(listed.data, listed.status) }, clientStatus(listed.status));
      }
      const authUsers: any[] = Array.isArray(listed.data?.users) ? listed.data.users : [];
      const totalHeader = listed.headers.get("x-total-count");
      const total = totalHeader ? Number(totalHeader) : authUsers.length;

      const ids = authUsers.map((user) => user.id).filter((id: unknown) => isUuid(id));
      const profiles = new Map<string, any>();
      const rolesByUser = new Map<string, string[]>();

      if (ids.length > 0) {
        const idFilter = `in.(${ids.join(",")})`;
        const profileResult = await rest(
          supabaseUrl,
          serviceKey,
          `profiles?select=user_id,full_name,phone,email&user_id=${idFilter}`,
          { method: "GET" },
        );
        if (profileResult.ok && Array.isArray(profileResult.data)) {
          for (const profile of profileResult.data) {
            profiles.set(profile.user_id, profile);
          }
        } else {
          console.error("Profile join failed", profileResult.status, profileResult.data);
        }

        const roleResult = await rest(
          supabaseUrl,
          serviceKey,
          `user_roles?select=user_id,role&user_id=${idFilter}`,
          { method: "GET" },
        );
        if (roleResult.ok && Array.isArray(roleResult.data)) {
          for (const row of roleResult.data) {
            const existing = rolesByUser.get(row.user_id) ?? [];
            if (!existing.includes(row.role)) existing.push(row.role);
            rolesByUser.set(row.user_id, existing);
          }
        } else {
          console.error("Role join failed", roleResult.status, roleResult.data);
        }
      }

      const users = authUsers.map((user) => {
        const profile = profiles.get(user.id) ?? {};
        const banned = user.ban_duration && user.ban_duration !== "none";
        return {
          id: user.id,
          email: user.email ?? profile.email ?? null,
          full_name: profile.full_name ?? user.user_metadata?.full_name ?? null,
          phone: profile.phone ?? null,
          roles: rolesByUser.get(user.id) ?? [],
          active: !banned,
          created_at: user.created_at ?? null,
          last_sign_in_at: user.last_sign_in_at ?? null,
        };
      });

      return json({ success: true, page, perPage, total, users }, 200);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error: any) {
    console.error("Error in admin-user-management function:", error);
    return json({ error: error?.message ?? "Internal server error" }, 500);
  }
});
