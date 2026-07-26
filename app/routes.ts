import {
  type RouteConfig,
  index,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),

  // Auth
  route("login", "routes/auth/login.tsx"),
  route("signup", "routes/auth/signup.tsx"),
  route("logout", "routes/auth/logout.tsx"),
  route("forgot-password", "routes/auth/forgot-password.tsx"),
  route("reset-password", "routes/auth/reset-password.tsx"),
  route("api/auth/*", "routes/api/auth.tsx"),

  // Customer storefront
  route("shop", "routes/shop/index.tsx"),
  route("shop/product/:listingId", "routes/shop/product.tsx"),
  route("shop/keep/:slug", "routes/shop/keep.tsx"),
  route("cart", "routes/shop/cart.tsx"),
  route("orders", "routes/orders/index.tsx"),
  route("orders/:orderId", "routes/orders/detail.tsx"),
  route("account", "routes/account.tsx"),

  // Public content pages
  route("privacy", "routes/legal/privacy.tsx"),
  route("terms", "routes/legal/terms.tsx"),
  route("contact", "routes/legal/contact.tsx"),

  // Admin portal (all children render inside StationShell via layout.tsx <Outlet/>)
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/index.tsx"),
    route("suppliers", "routes/admin/suppliers.tsx"),
    route("products", "routes/admin/products.tsx"),
    route("windows", "routes/admin/windows.tsx"),
    route("windows/:windowId", "routes/admin/window-detail.tsx"),
    route("windows/:windowId/listings", "routes/admin/window-listings.tsx"),
    route("windows/:windowId/reservations", "routes/admin/window-reservations.tsx"),
    route("windows/:windowId/sheets", "routes/admin/window-sheets.tsx"),
    route("windows/:windowId/reconcile", "routes/admin/window-reconcile.tsx"),
    route("assistant", "routes/admin/assistant.tsx"),
    route("finance", "routes/admin/finance.tsx"),
    route("finance/export.csv", "routes/admin/finance-export.tsx"),
    route("users", "routes/admin/users.tsx"),
    route("settings", "routes/admin/settings.tsx"),
  ]),

  // Fulfillment desk
  route("desk", "routes/desk/index.tsx"),
  route("desk/order/:orderId", "routes/desk/order.tsx"),
  route("desk/order/:orderId/manifest", "routes/desk/manifest.tsx"),

  // Resource routes
  route("api/stripe/webhook", "routes/api/stripe-webhook.tsx"),
  route("api/images/upload", "routes/api/image-upload.tsx"),
  route("api/catalog-import", "routes/api/catalog-import.tsx"),
  route("img/*", "routes/img.tsx"),
] satisfies RouteConfig;
