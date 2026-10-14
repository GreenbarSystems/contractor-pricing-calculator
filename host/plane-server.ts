import { createServer } from "node:http"
import { bootPlane, closePlane, runConfirm, runPrompt, runPublish, runRestore, snapshot, workspaceForToken } from "./session.js"
import { copy } from "./copy.js"

process.env.GIT_TERMINAL_PROMPT ??= "0"
process.env.GCM_INTERACTIVE ??= "never"

const port = Number.parseInt(process.env.PLANE_PORT ?? "43188", 10)
const token = process.env.GITHUB_TOKEN ?? ""
const repoRoot = process.env.PLANE_WORKSPACE ?? process.cwd()
const workspace = workspaceForToken(repoRoot, token)

let opened: Awaited<ReturnType<typeof bootPlane>>
try {
  opened = await bootPlane(workspace, token)
  if (opened.kind === "problem") console.error(opened.message)
  else console.log(`plane workspace ${opened.workspace}`)
} catch (error) {
  const message = error instanceof Error ? error.message : copy.cannotPush
  console.error(message)
  opened = { kind: "problem", problem: { kind: "cannotPush", repo: { noun: "branch", label: copy.openOnGitHub, url: "" as never } }, message }
}

const server = createServer((req, res) => {
  void handle(req, res)
})

server.listen(port, "0.0.0.0", () => {
  console.log(`plane host on http://127.0.0.1:${port}`)
})

process.on("SIGINT", () => {
  void closePlane().then(() => process.exit(0))
})
process.on("SIGTERM", () => {
  void closePlane().then(() => process.exit(0))
})

async function handle(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  const url = req.url ?? "/"
  const path = url.split("?")[0]
  const send = (code: number, body: unknown) => {
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    })
    res.end(JSON.stringify(body))
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    })
    res.end()
    return
  }
  try {
    if (opened.kind === "problem") {
      send(409, { error: opened.message, problem: opened.problem.kind, copy })
      return
    }
    if (path === "/api/view" && req.method === "GET") {
      send(200, await snapshot())
      return
    }
    const body = req.method === "POST" ? await readJson(req) : {}
    if (path === "/api/prompt" && req.method === "POST") {
      const prompt = String(body.prompt ?? "").trim()
      const draft = "draft" in body ? body.draft : null
      if (prompt.length === 0 && (draft === null || draft === undefined)) {
        send(400, { error: "Change the job or describe the change, then send.", copy })
        return
      }
      send(200, await runPrompt(prompt.length > 0 ? prompt : "Saved", draft))
      return
    }
    if ((path === "/api/undo" || path === "/api/restore") && req.method === "POST") {
      send(200, await runRestore(String(body.to ?? "")))
      return
    }
    if (path === "/api/publish" && req.method === "POST") {
      send(200, await runPublish())
      return
    }
    if (path === "/api/confirm" && req.method === "POST") {
      send(200, await runConfirm(String(body.card ?? "")))
      return
    }
    send(404, { error: "Not found", copy })
  } catch (error) {
    send(500, { error: error instanceof Error ? error.message : "failed", copy })
  }
}

async function readJson(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString("utf8")
  if (raw.length === 0) return {}
  return JSON.parse(raw) as Record<string, unknown>
}
