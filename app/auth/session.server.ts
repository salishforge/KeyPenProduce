import { redirect } from "react-router";
import { createAuth } from "./auth.server";
import type { AppEnv } from "~/lib/env";
import type { UserRole } from "~/db/schema";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  stripeCustomerId: string | null;
}

/** Resolve the current user (or null) from the request cookies. */
export async function getSessionUser(
  env: AppEnv,
  request: Request,
): Promise<SessionUser | null> {
  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const u = session.user as typeof session.user & {
    role?: UserRole;
    stripeCustomerId?: string | null;
  };
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: (u.role as UserRole) ?? "client",
    emailVerified: u.emailVerified,
    stripeCustomerId: u.stripeCustomerId ?? null,
  };
}

/** Require a signed-in user or redirect to /login. */
export async function requireUser(
  env: AppEnv,
  request: Request,
): Promise<SessionUser> {
  const user = await getSessionUser(env, request);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname)}`);
  }
  return user;
}

/** Require a user holding one of `roles`, else 403 (or login if anonymous). */
export async function requireRole(
  env: AppEnv,
  request: Request,
  roles: UserRole[],
): Promise<SessionUser> {
  const user = await requireUser(env, request);
  if (!roles.includes(user.role)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

/** The home page each role lands on. */
export function landingPathForRole(role: UserRole): string {
  switch (role) {
    case "admin":
    case "product_admin":
      return "/admin";
    case "fulfillment":
      return "/desk";
    default:
      return "/shop";
  }
}

/**
 * Reduce a caller-supplied `redirectTo` to a safe same-origin path, or "/" when
 * it isn't one. Used for the OAuth callback, where the role isn't known until
 * the provider returns — landing on "/" then role-bounces via the home route.
 */
export function sanitizeRedirectPath(
  redirectTo: string | null | undefined,
): string {
  if (!redirectTo) return "/";
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) return "/";
  return redirectTo;
}

/** Roles that run the business portal / pickup desk rather than shopping. */
const STAFF_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  "admin",
  "product_admin",
  "fulfillment",
]);

/** Can this role actually open `path`? Mirrors the requireRole checks. */
function roleCanReach(role: UserRole, path: string): boolean {
  if (path.startsWith("/admin")) {
    return role === "admin" || role === "product_admin";
  }
  if (path.startsWith("/desk")) {
    return role === "fulfillment" || role === "admin";
  }
  return true;
}

/**
 * Where to send someone straight after signing in or signing up.
 *
 * Staff go to their portal (admin -> /admin, fulfillment -> /desk) and
 * customers go to the storefront, rather than everyone bouncing through "/".
 * An explicit `redirectTo` is honored only when it's a real, same-origin
 * destination the role can actually open — so a customer is never dropped into
 * a staff area they'd get a 403 from, and staff aren't stranded on the
 * storefront just because they signed in from the shop header.
 *
 * The one deliberate exception is /cart: a staff member who was mid-basket
 * genuinely meant to go there, so that intent is preserved.
 *
 * This is also the guard against open redirects — anything that isn't a plain
 * same-origin path ("//evil.com", "https://evil.com", "javascript:...") is
 * discarded in favour of the role's home.
 */
export function resolvePostAuthPath(
  role: UserRole,
  redirectTo: string | null | undefined,
): string {
  const home = landingPathForRole(role);
  if (!redirectTo) return home;

  // Same-origin absolute paths only. "//host" is protocol-relative (off-site).
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) return home;
  // "/" is the generic default, not somewhere the user asked to go.
  if (redirectTo === "/") return home;

  if (!roleCanReach(role, redirectTo)) return home;

  const isStaffArea =
    redirectTo.startsWith("/admin") || redirectTo.startsWith("/desk");
  if (STAFF_ROLES.has(role) && !isStaffArea && redirectTo !== "/cart") {
    return home;
  }
  return redirectTo;
}
