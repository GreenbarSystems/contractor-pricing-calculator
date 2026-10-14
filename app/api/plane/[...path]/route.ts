const plane = process.env.PLANE_URL ?? "http://127.0.0.1:43188";

async function relay(request: Request, path: string[]) {
  const target = `${plane}/api/${path.join("/")}`;
  const init: RequestInit = { method: request.method, headers: { "Content-Type": "application/json" } };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }
  const upstream = await fetch(target, init);
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

async function paramsOf(ctx: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  return Promise.resolve(ctx.params);
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  const { path } = await paramsOf(ctx);
  return relay(request, path);
}

export async function POST(request: Request, ctx: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  const { path } = await paramsOf(ctx);
  return relay(request, path);
}
