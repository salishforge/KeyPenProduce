import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { createAuth } from "~/auth/auth.server";
import { redirectWithCookies } from "~/auth/forward";

export async function action({ request, context }: Route.ActionArgs) {
  const auth = createAuth(context.cloudflare.env);
  const res = await auth.api.signOut({ headers: request.headers, asResponse: true });
  return redirectWithCookies("/login", res);
}

export async function loader() {
  throw redirect("/");
}
