import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { LinksFunction } from "react-router";
import type { Route } from "./+types/root";

// Stylesheet order is load-bearing. app.css holds the legacy utility classes
// (.card/.btn/.grid) that un-migrated screens still use; it loads FIRST so the
// kp- design system below wins the base-level overlaps (body background, font,
// color). theme.css MUST precede shop/admin/preservation — they consume its
// --kp-* tokens. app.css is removed once every screen is migrated.
import "./app.css";
import "~/styles/theme.css";
import "~/styles/shop.css";
import "~/styles/admin.css";
import "~/styles/preservation.css";

// Fonts via <link> (preconnect + one combined Google Fonts sheet), kept out of
// CSS @import to avoid the render-blocking penalty.
export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href:
      "https://fonts.googleapis.com/css2?" +
      "family=Bricolage+Grotesque:opsz,wght@12..96,400..700&" +
      "family=Hanken+Grotesk:wght@400;500;600;700&" +
      "family=Spectral:ital,wght@0,400;0,500;1,400;1,500&" +
      "display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Not found" : `Error ${error.status}`;
    details = error.statusText || details;
    if (error.status === 403) details = "You don't have access to this page.";
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }
  return (
    <main className="container">
      <h1>{message}</h1>
      <p>{details}</p>
      <p>
        <a href="/">Return home</a>
      </p>
    </main>
  );
}
