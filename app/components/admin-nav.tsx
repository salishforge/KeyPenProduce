import { NavLink } from "react-router";

const links = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/suppliers", label: "Suppliers" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/windows", label: "Windows" },
  { to: "/admin/finance", label: "Finance" },
  { to: "/admin/users", label: "Users" },
];

export function AdminNav() {
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
      {links.map((l) => (
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
