import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { openProject, toNote, type OpenResult, type View } from "control-plane"
import { restoreIntent } from "./intents.js"
import { copy } from "./copy.js"

const PREVIEW = join("turns", "job.json")
const NOTE = join("turns", "latest.md")

export type ThreadTurn = { id: string; prompt: string; note: string }

type IdleGate = {
  idle: Promise<void>
  begin: () => void
  end: () => void
}

export type HostState = {
  workspace: string
  opened: Extract<OpenResult, { kind: "open" }>
  view: View
  thread: ThreadTurn[]
}

type Live = { state: HostState; idleGate: IdleGate }

let current: Live | null = null

function makeIdle(): IdleGate {
  let settle: () => void = () => undefined
  const gate: IdleGate = {
    idle: Promise.resolve(),
    begin() {
      gate.idle = new Promise<void>((resolve) => {
        settle = resolve
      })
    },
    end() {
      settle()
      gate.idle = Promise.resolve()
    },
  }
  return gate
}

export function workspaceForToken(repoRoot: string, token: string): string {
  if (token.length > 0) return repoRoot
  const root = join(tmpdir(), "cpc-plane-host")
  const bare = join(root, "origin.git")
  const work = join(root, "work")
  let linked = existsSync(join(work, ".git"))
  if (linked) {
    try {
      execFileSync("git", ["-C", work, "rev-parse", "--is-inside-work-tree"], { stdio: "pipe" })
      execFileSync("git", ["-C", work, "remote", "get-url", "origin"], { stdio: "pipe" })
    } catch {
      linked = false
    }
  }
  if (!linked) {
    rmSync(root, { recursive: true, force: true })
    mkdirSync(root, { recursive: true })
    execFileSync("git", ["clone", "--bare", repoRoot, bare])
    try {
      execFileSync("git", ["--git-dir", bare, "symbolic-ref", "HEAD", "refs/heads/main"])
    } catch {
      execFileSync("git", ["--git-dir", bare, "symbolic-ref", "HEAD", "refs/heads/master"])
    }
    try {
      execFileSync("git", ["clone", "--branch", "main", bare, work])
    } catch {
      execFileSync("git", ["clone", bare, work])
    }
    execFileSync("git", ["-C", work, "config", "user.name", "You"])
    execFileSync("git", ["-C", work, "config", "user.email", "you@local"])
  }
  return work
}

export async function bootPlane(workspace: string, token: string) {
  const idleGate = makeIdle()
  const opened = await openProject(workspace, { token }, {
    turnIdle: async () => {
      await idleGate.idle
    },
  })
  if (opened.kind !== "open") {
    const message =
      opened.kind === "locked" ? copy.locked : opened.kind === "notLinked" ? copy.notLinked : copy.cannotPush
    return { kind: "problem" as const, problem: opened, message }
  }
  const view = await opened.human.view()
  const state: HostState = { workspace, opened, view, thread: [] }
  opened.human.subscribe((next) => {
    state.view = next
  })
  current = { state, idleGate }
  return { kind: "ready" as const, opened, workspace }
}

export function problemCopy(kind: "locked" | "notLinked" | "cannotPush"): string {
  if (kind === "locked") return copy.locked
  if (kind === "notLinked") return copy.notLinked
  return copy.cannotPush
}

export async function runPrompt(prompt: string, draft: unknown = null) {
  const { state, idleGate } = must()
  idleGate.begin()
  try {
    const paths = [NOTE]
    mkdirSync(join(state.workspace, dirname(NOTE)), { recursive: true })
    writeFileSync(join(state.workspace, NOTE), `${prompt}\n`)
    if (draft !== null && draft !== undefined) {
      writeFileSync(join(state.workspace, PREVIEW), `${JSON.stringify(draft, null, 2)}\n`)
      paths.push(PREVIEW)
    }
    state.opened.noteWrites(paths)
    await state.opened.agent.run({ kind: "save", note: toNote(prompt) })
    state.thread.push({ id: String(state.thread.length + 1), prompt, note: prompt })
    state.view = await state.opened.human.view()
    return { view: state.view, thread: state.thread, preview: readPreview(state.workspace) }
  } finally {
    idleGate.end()
  }
}

export async function runRestore(to: string) {
  const { state } = must()
  const result = await state.opened.human.run(restoreIntent(to))
  state.view = await state.opened.human.view()
  return { result, view: state.view, thread: state.thread, preview: readPreview(state.workspace) }
}

export async function runPublish() {
  const { state } = must()
  const result = await state.opened.human.run({ kind: "publish" })
  state.view = await state.opened.human.view()
  return { result, view: state.view, thread: state.thread, preview: readPreview(state.workspace) }
}

export async function runConfirm(card: string) {
  const { state } = must()
  const result = await state.opened.human.confirm(card as never)
  state.view = await state.opened.human.view()
  return { result, view: state.view, thread: state.thread, preview: readPreview(state.workspace) }
}

export async function snapshot() {
  const { state } = must()
  state.view = await state.opened.human.view()
  return { view: state.view, thread: state.thread, copy, preview: readPreview(state.workspace) }
}

function readPreview(workspace: string): unknown {
  const path = join(workspace, PREVIEW)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown
  } catch {
    return null
  }
}

export async function closePlane() {
  if (!current) return
  await current.state.opened.close()
  current = null
}

function must(): Live {
  if (!current) throw new Error("plane is not open")
  return current
}
