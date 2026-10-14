import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { agentTools } from "../src/open.js"
import type { AgentControls } from "../src/types.js"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dtsPath = join(root, "dist", "index.d.ts")
const dts = readFileSync(dtsPath, "utf8")

const forbidden = ["Commit", "Ref", "Remote", "Sha"] as const
const exported = new Set<string>()
for (const match of dts.matchAll(/^export (?:type|declare type|\{[^}]*\b(type\s+)?([A-Z][A-Za-z0-9]*)\b)/gm)) {
  void match
}
for (const match of dts.matchAll(/export type (\w+)/g)) {
  if (match[1]) exported.add(match[1])
}
for (const match of dts.matchAll(/export \{([^}]+)\}/g)) {
  const block = match[1] ?? ""
  for (const part of block.split(",")) {
    const name = part.replace(/type\s+/g, "").trim().split(/\s+as\s+/).pop()
    if (name) exported.add(name)
  }
}

const hits = forbidden.filter((name) => exported.has(name) || new RegExp(`export (type|declare) .*\\b${name}\\b`).test(dts))
if (hits.length > 0) {
  console.error(`public exports include Git type names: ${hits.join(", ")}`)
  process.exit(1)
}

const dummy: AgentControls = {
  async run() {
    return { kind: "busy" }
  },
  async offerCombined() {
    return { kind: "busy" }
  },
  async view() {
    throw new Error("unused")
  },
}
const tools = agentTools(dummy)
const names = tools.map((tool) => tool.name)
if ((names as readonly string[]).includes("confirm") || (names as readonly string[]).includes("answer")) {
  console.error(`agentTools includes confirm or answer: ${names.join(", ")}`)
  process.exit(1)
}

const allowedGrantFiles = new Set(["src/core/plane.js", "src/open.js"])
const offenders: string[] = []
walk(join(root, "src"), (file) => {
  if (!file.endsWith(".js") || file.endsWith(".test.js")) return
  const rel = relative(root, file).replaceAll("\\", "/")
  const src = readFileSync(file, "utf8")
  const callsGrant = /(?<![A-Za-z])grant\s*\(/.test(src)
  const callsIssue = /issuePublishGrant\s*\(/.test(src)
  if ((callsGrant || callsIssue) && !allowedGrantFiles.has(rel) && rel !== "src/core/facts.js") {
    if (rel === "src/core/facts.js" && !callsIssue && !/\bgrant\s*\(/.test(src)) return
  }
  if ((callsGrant && !allowedGrantFiles.has(rel) && rel !== "src/core/facts.js") || (callsIssue && !allowedGrantFiles.has(rel))) {
    offenders.push(rel)
  }
})

if (offenders.length > 0) {
  console.error(`grant must only be called from plane.ts and open.ts: ${offenders.join(", ")}`)
  process.exit(1)
}

console.log("check-surface ok")

function walk(dir: string, visit: (file: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, visit)
    else visit(path)
  }
}
