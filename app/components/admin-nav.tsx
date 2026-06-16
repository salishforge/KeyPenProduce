import { NavLink } from "react-router";
import type { UserRole } from "~/db/schema";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
}

const links: NavItem[] = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/suppliers", label: "Suppliers" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/windows", label: "Windows" },
  { to: "/admin/assistant", label: "Assistant" },
  { to: "/admin/finance", label: "Finance", adminOnly: true },
  { to: "/admin/users", label: "Users", adminOnly: true },
];

/** Admin sub-nav. Finance + Users are admin-only; product_admin sees the rest. */
export function AdminNav({ role }: { role: UserRole }) {
  const visible = links.filter((l) => !l.adminOnly || role === "admin");
  return (
    <div
      className="row"
      style={{
        gap: "0.5rem",
        padding: "0.5rem 1.5rem",
        background: "#eef2ea",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {visible.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          style={({ isActive }) => ({
            textDecoration: "none",
            fontWeight: isActive ? 700 : 400,
            color: "var(--green-dark)",
          })}
        >
          {l.label}
        </NavLink>
      ))}
    </div>
  );
}
