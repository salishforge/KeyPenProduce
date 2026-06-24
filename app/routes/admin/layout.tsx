import { Outlet } from "react-router";
import type { Route } from "./+types/layout";
import { requireRole } from "~/auth/session.server";
import { StationShell } from "~/components/admin/StationShell";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  // product_admin can reach the catalog areas; financial/account routes
  // re-check ["admin"] themselves, and StationShell hides their nav links.
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  return { staffName: user.name, role: user.role };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <StationShell role={loaderData.role}>
      <Outlet />
    </StationShell>
  );
}
