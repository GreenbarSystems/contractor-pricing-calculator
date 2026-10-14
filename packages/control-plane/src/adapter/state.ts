import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { CardId, FilePath, Login, QuestionId } from "../types.js"
import { asCardId, asFilePath, asLogin, asQuestionId } from "../types.js"
import type { Approval, BlobId, Sha } from "../core/facts.js"
import { asBlobId, asSha } from "../core/facts.js"

export type PlaneState = {
  approval: Approval | null
  offer: { question: QuestionId; files: ReadonlyMap<FilePath, BlobId> } | null
  touched: ReadonlySet<FilePath>
}

export function planeDir(workspaceDir: string): string {
  return join(workspaceDir, ".git", "plane")
}

export function lockPath(workspaceDir: string): string {
  return join(planeDir(workspaceDir), "lock")
}

export function tryLock(workspaceDir: string, pid: number): "held" | "locked" | "adopted" {
  mkdirSync(planeDir(workspaceDir), { recursive: true })
  const path = lockPath(workspaceDir)
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8").trim()
    const holder = Number.parseInt(raw, 10)
    if (Number.isFinite(holder) && processAlive(holder)) return "locked"
    writeFileSync(path, `${pid}\n`)
    return "adopted"
  }
  writeFileSync(path, `${pid}\n`)
  return "held"
}

export function unlock(workspaceDir: string): void {
  const path = lockPath(workspaceDir)
  if (existsSync(path)) unlinkSync(path)
}

export function loadState(workspaceDir: string): PlaneState {
  mkdirSync(planeDir(workspaceDir), { recursive: true })
  return {
    approval: loadApproval(workspaceDir),
    offer: loadOffer(workspaceDir),
    touched: loadTouched(workspaceDir),
  }
}

export function appendTouched(workspaceDir: string, paths: readonly string[]): void {
  mkdirSync(planeDir(workspaceDir), { recursive: true })
  const current = loadTouched(workspaceDir)
  const next = new Set(current)
  for (const path of paths) {
    if (path.length > 0) next.add(asFilePath(path))
  }
  writeTouched(workspaceDir, next)
}

export function subtractTouched(workspaceDir: string, paths: readonly FilePath[]): void {
  const current = new Set(loadTouched(workspaceDir))
  for (const path of paths) current.delete(path)
  writeTouched(workspaceDir, current)
}

export function writeApproval(workspaceDir: string, approval: Approval | null): void {
  const path = join(planeDir(workspaceDir), "approval.json")
  if (approval === null) {
    if (existsSync(path)) unlinkSync(path)
    return
  }
  atomicWrite(path, JSON.stringify(approval))
}

export function writeOffer(
  workspaceDir: string,
  offer: { question: QuestionId; files: ReadonlyMap<FilePath, BlobId> } | null,
): void {
  const path = join(planeDir(workspaceDir), "offers.json")
  if (offer === null) {
    if (existsSync(path)) unlinkSync(path)
    return
  }
  atomicWrite(
    path,
    JSON.stringify({
      question: offer.question,
      files: Object.fromEntries([...offer.files.entries()]),
    }),
  )
}

function loadApproval(workspaceDir: string): Approval | null {
  const path = join(planeDir(workspaceDir), "approval.json")
  if (!existsSync(path)) return null
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (!raw || typeof raw !== "object") return null
  const rec = raw as Record<string, unknown>
  if (rec.kind === "publish" && typeof rec.card === "string" && typeof rec.version === "string") {
    return { kind: "publish", card: asCardId(rec.card), version: asSha(rec.version) }
  }
  if (
    rec.kind === "askForReview" &&
    typeof rec.card === "string" &&
    typeof rec.version === "string" &&
    Array.isArray(rec.reviewers)
  ) {
    const reviewers = rec.reviewers.filter((item): item is string => typeof item === "string").map(asLogin)
    const first = reviewers[0]
    if (!first) return null
    return {
      kind: "askForReview",
      card: asCardId(rec.card),
      version: asSha(rec.version),
      reviewers: [first, ...reviewers.slice(1)] as readonly [Login, ...Login[]],
    }
  }
  return null
}

function loadOffer(workspaceDir: string): PlaneState["offer"] {
  const path = join(planeDir(workspaceDir), "offers.json")
  if (!existsSync(path)) return null
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (!raw || typeof raw !== "object") return null
  const rec = raw as Record<string, unknown>
  if (typeof rec.question !== "string" || !rec.files || typeof rec.files !== "object") return null
  const files = new Map<FilePath, BlobId>()
  for (const [pathKey, value] of Object.entries(rec.files as Record<string, unknown>)) {
    if (typeof value === "string") files.set(asFilePath(pathKey), asBlobId(value))
  }
  return { question: asQuestionId(rec.question), files }
}

function loadTouched(workspaceDir: string): Set<FilePath> {
  const path = join(planeDir(workspaceDir), "touched")
  if (!existsSync(path)) return new Set()
  const lines = readFileSync(path, "utf8").split("\n").map((line) => line.trim()).filter(Boolean)
  return new Set(lines.map(asFilePath))
}

function writeTouched(workspaceDir: string, paths: ReadonlySet<FilePath>): void {
  const path = join(planeDir(workspaceDir), "touched")
  atomicWrite(path, [...paths].sort().join("\n") + (paths.size > 0 ? "\n" : ""))
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function atomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, body)
  renameSync(tmp, path)
}
