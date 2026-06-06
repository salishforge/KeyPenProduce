import type { Route } from "./+types/img";

/** Serve product images from R2 with a long immutable cache. */
export async function loader({ params, context }: Route.LoaderArgs) {
  const key = params["*"];
  if (!key) throw new Response("Not found", { status: 404 });
  const object = await context.cloudflare.env.PRODUCT_IMAGES.get(key);
  if (!object) throw new Response("Not found", { status: 404 });
  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType ?? "application/octet-stream",
  );
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}
