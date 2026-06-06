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
      return "/admin";
    case "fulfillment":
      return "/desk";
    default:
      return "/shop";
  }
}
