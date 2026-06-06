import { Form, Link } from "react-router";
import type { UserRole } from "~/db/schema";

export interface NavUser {
  name: string;
  role: UserRole;
}

export function TopNav({ user }: { user: NavUser | null }) {
  return (
    <nav className="topnav">
      <div>
        <Link to="/" className="brand">
          Key Pen Produce
        </Link>
        {user?.role === "client" && <Link to="/shop">Shop</Link>}
        {user && <Link to="/orders">My Orders</Link>}
        {user?.role === "admin" && <Link to="/admin">Admin</Link>}
        {(user?.role === "fulfillment" || user?.role === "admin") && (
          <Link to="/desk">Pickup Desk</Link>
        )}
      </div>
      <div className="row">
        {user ? (
          <>
            <span>
              {user.name} <span className="badge">{user.role}</span>
            </span>
            <Form method="post" action="/logout">
              <button className="secondary" type="submit">
                Sign out
              </button>
            </Form>
          </>
        ) : (
          <>
            <Link to="/login">Sign in</Link>
            <Link to="/signup" className="btn">
              Sign up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
