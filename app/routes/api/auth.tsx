import { createAuth } from "~/auth/auth.server";
import type { Route } from "./+types/auth";

// better-auth owns everything under /api/auth/* (sign-in/up, OAuth callbacks,
// verification, password reset).
export async function loader({ request, context }: Route.LoaderArgs) {
  return createAuth(context.cloudflare.env).handler(request);
}

export async function action({ request, context }: Route.ActionArgs) {
  return createAuth(context.cloudflare.env).handler(request);
}
