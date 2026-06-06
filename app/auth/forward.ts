import { redirect } from "react-router";

/** Redirect while forwarding any Set-Cookie headers from a better-auth Response. */
export function redirectWithCookies(to: string, from: Response): Response {
  const headers = new Headers();
  for (const cookie of from.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  return redirect(to, { headers });
}
