/**
 * StationShell — the business-portal frame: tidewater sidebar + light main.
 * Wrap admin route content in this (typically from the app/routes/admin.tsx
 * layout via <Outlet/>). NavLink drives the active state automatically.
 *
 * Intended location: app/components/admin/StationShell.tsx
 */
import { Link, NavLink } from "react-router";
import type { ReactNode } from "react";
import { LeafMark } from "~/components/ui/Icons";

interface NavItem {
  to: string;
  label: string;
  /** `end` for index-style exact matching (e.g. the dashboard root). */
  end?: boolean;
}

// Routes must match app/routes.ts. Window sub-pages (listings, reconcile,
// sheets, reservations) hang off a specific /admin/windows/:id, so they aren't
// top-level nav — they're reached from the windows screen.
const PRIMARY: NavItem[] = [
  { to: "/admin", label: "This week", end: true },
  { to: "/admin/windows", label: "Windows" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/suppliers", label: "Suppliers" },
  { to: "/admin/assistant", label: "Assistant" },
];

const RECORDS: NavItem[] = [
  { to: "/admin/finance", label: "Finance" },
  { to: "/admin/users", label: "Customers" },
  { to: "/admin/settings", label: "Settings" },
];

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "is-active" : undefined;
}

export function StationShell({ children }: { children: ReactNode }) {
  return (
    <div className="kp-station">
      <nav className="kp-station__side">
        <Link to="/admin" className="kp-station__brand">
          <LeafMark size={18} style={{ color: "#eef3f0" }} />
          Key Pen
        </Link>
        <div className="kp-station__sub">Station</div>
        <div className="kp-station__nav">
          {PRIMARY.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              {item.label}
            </NavLink>
          ))}
          <div className="grp">Records</div>
          {RECORDS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="kp-station__main">{children}</main>
    </div>
  );
}
