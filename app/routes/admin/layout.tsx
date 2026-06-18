import { Outlet } from "react-router";
import type { Route } from "./+types/layout";
import { requireRole } from "~/auth/session.server";
import { StationShell } from "~/components/admin/StationShell";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  return { staffName: user.name };
}

export default function AdminLayout() {
  return (
    <StationShell>
      <Outlet />
    </StationShell>
  );
}
