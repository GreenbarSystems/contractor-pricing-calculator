const plane = process.env.PLANE_URL ?? "http://127.0.0.1:43188";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const noStore = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
};

async function relay(request: Request, path: string[]) {
  const target = `${plane}/api/${path.join("/")}`;
  const contentType = request.headers.get("content-type") ?? "";
  const init: RequestInit = { method: request.method, headers: { "Content-Type": "application/json" } };
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (contentType.includes("application/json") || contentType.length === 0) {
      init.body = await request.text();
    } else {
      const form = await request.formData();
      let draft: unknown = null;
      const raw = form.get("draft");
      if (typeof raw === "string" && raw.length > 0) {
        try {
          draft = JSON.parse(raw) as unknown;
        } catch {
          draft = null;
        }
      }
      init.body = JSON.stringify({ prompt: String(form.get("prompt") ?? ""), draft });
    }
  }
  const upstream = await fetch(target, { ...init, cache: "no-store" });
  const text = await upstream.text();
  const accept = request.headers.get("accept") ?? "";
  if (request.method === "POST" && path[0] === "prompt" && accept.includes("text/html") && !accept.includes("application/json")) {
    return Response.redirect(new URL("/", request.url), 303);
  }
  return new Response(text, {
    status: upstream.status,
    headers: noStore,
  });
}

async function paramsOf(ctx: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  return Promise.resolve(ctx.params);
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  const { path } = await paramsOf(ctx);
  return relay(request, path);
}

export async function HEAD(request: Request, ctx: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  const { path } = await paramsOf(ctx);
  return relay(request, path);
}

export async function POST(request: Request, ctx: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  const { path } = await paramsOf(ctx);
  return relay(request, path);
}
