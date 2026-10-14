import { execFile } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import type { FilePath, Login, Person } from "../types.js"
import { asFilePath, asInstant, asLogin, asNonEmpty, asNote, asQuestionId } from "../types.js"
import type {
  BranchName,
  CommitFact,
  Made,
  Probe,
  Sha,
  Step,
  TreeSha,
} from "../core/facts.js"
import { asBranchName, asSaveKey, asSha, asTreeSha } from "../core/facts.js"
import { draftBranch } from "../core/plane.js"

const exec = promisify(execFile)

export type GitLink = {
  workspaceDir: string
  originUrl: string
  defaultBranch: BranchName
}

export async function inspectGit(workspaceDir: string): Promise<
  | { kind: "linked"; originUrl: string; defaultBranch: BranchName }
  | { kind: "notLinked" }
> {
  const inside = await git(workspaceDir, ["rev-parse", "--is-inside-work-tree"]).catch(() => null)
  if (!inside || inside.stdout.trim() !== "true") return { kind: "notLinked" }
  const origin = await git(workspaceDir, ["remote", "get-url", "origin"]).catch(() => null)
  const originUrl = origin?.stdout.trim() ?? ""
  const defaultBranch = asBranchName(await detectDefaultBranch(workspaceDir))
  if (originUrl.length === 0) return { kind: "notLinked" }
  return { kind: "linked", originUrl, defaultBranch }
}

export async function currentUser(workspaceDir: string): Promise<Person> {
  const login = (await git(workspaceDir, ["config", "user.name"]).catch(() => ({ stdout: "you" }))).stdout
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
  const name = (await git(workspaceDir, ["config", "user.name"]).catch(() => ({ stdout: "You" }))).stdout.trim()
  return { login: asLogin(login.length > 0 ? login : "you"), name: name.length > 0 ? name : "You" }
}

export async function liveTip(workspaceDir: string, branch: BranchName): Promise<{ sha: Sha; tree: TreeSha }> {
  const sha = asSha((await git(workspaceDir, ["rev-parse", branch])).stdout.trim())
  const tree = asTreeSha((await git(workspaceDir, ["rev-parse", `${sha}^{tree}`])).stdout.trim())
  return { sha, tree }
}

export async function headSha(workspaceDir: string): Promise<Sha> {
  return asSha((await git(workspaceDir, ["rev-parse", "HEAD"])).stdout.trim())
}

export async function worktreeTree(workspaceDir: string): Promise<TreeSha> {
  const index = join(workspaceDir, ".git", "plane", "index-read")
  await git(workspaceDir, ["read-tree", "HEAD"], { GIT_INDEX_FILE: index })
  await git(workspaceDir, ["add", "-A"], { GIT_INDEX_FILE: index })
  const tree = (await git(workspaceDir, ["write-tree"], { GIT_INDEX_FILE: index })).stdout.trim()
  return asTreeSha(tree)
}

export async function currentBranch(workspaceDir: string): Promise<BranchName> {
  return asBranchName((await git(workspaceDir, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim())
}

export async function remoteSha(workspaceDir: string, branch: BranchName): Promise<Sha | null> {
  const got = await git(workspaceDir, ["rev-parse", `origin/${branch}`]).catch(() => null)
  if (!got) return null
  return asSha(got.stdout.trim())
}

export async function loadCommits(workspaceDir: string, branch: BranchName): Promise<CommitFact[]> {
  const format = "%H%x1f%P%x1f%T%x1f%s%x1f%ct%x1f%b%x1e"
  const raw = await git(workspaceDir, ["log", branch, `--format=${format}`]).catch(() => ({ stdout: "" }))
  const chunks = raw.stdout.split("\x1e").map((chunk) => chunk.trim()).filter(Boolean)
  const commits: CommitFact[] = []
  for (const chunk of chunks) {
    const [sha, parentsRaw, tree, subject, ct, body] = chunk.split("\x1f")
    if (!sha || !tree || !subject || !ct) continue
    const parents = (parentsRaw ?? "").split(" ").filter(Boolean).map(asSha)
    const parentList = asNonEmpty(parents) ?? ([asSha(sha)] as const)
    commits.push({
      sha: asSha(sha),
      parents: parentList,
      tree: asTreeSha(tree),
      subject: asNote(subject),
      at: asInstant(Number.parseInt(ct, 10) * 1000),
      made: parseMade(body ?? ""),
    })
  }
  return commits
}

export async function probeMerge(workspaceDir: string, ours: Sha, theirs: Sha): Promise<Probe> {
  if (ours === theirs) return { kind: "upToDate" }
  const base = await git(workspaceDir, ["merge-base", ours, theirs]).catch(() => null)
  if (base && base.stdout.trim() === theirs) return { kind: "upToDate" }
  const merge = await git(workspaceDir, ["merge-tree", ours, theirs]).catch(() => null)
  if (!merge) return { kind: "clean", theirs }
  const files = conflictPaths(merge.stdout)
  const nonempty = asNonEmpty(files)
  if (nonempty) return { kind: "conflicts", theirs, files: nonempty }
  return { kind: "clean", theirs }
}

export async function nextDraftName(workspaceDir: string, login: Login): Promise<BranchName> {
  const refs = await git(workspaceDir, ["for-each-ref", "--format=%(refname:short)", `refs/heads/draft/${login}`]).catch(
    () => ({ stdout: "" }),
  )
  let max = 0
  for (const line of refs.stdout.split("\n")) {
    const match = /\/(\d+)$/.exec(line.trim())
    if (match?.[1]) max = Math.max(max, Number.parseInt(match[1], 10))
  }
  return asBranchName(draftBranch(login, max + 1))
}

export async function applyGit(workspaceDir: string, liveBranch: BranchName, me: Person, step: Step): Promise<"applied" | "noEffect"> {
  switch (step.kind) {
    case "commitSave":
      return commitSave(workspaceDir, liveBranch, me, step)
    case "commitGoBack":
      return commitGoBack(workspaceDir, step)
    case "merge":
      return merge(workspaceDir, step)
    case "push":
      return push(workspaceDir, step)
    case "moveToLive":
      return moveToLive(workspaceDir, liveBranch, step.tip)
    case "openPullRequest":
    case "mergePullRequest":
      return "noEffect"
    default: {
      const _never: never = step
      return _never
    }
  }
}

async function commitSave(
  workspaceDir: string,
  liveBranch: BranchName,
  me: Person,
  step: Extract<Step, { kind: "commitSave" }>,
): Promise<"applied" | "noEffect"> {
  const branchNow = (await git(workspaceDir, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim()
  if (branchNow === liveBranch || branchNow === "HEAD") {
    const name = await nextDraftName(workspaceDir, me.login)
    await git(workspaceDir, ["checkout", "-B", name, step.parent])
  }
  const listed = await git(workspaceDir, ["status", "--porcelain"]).catch(() => ({ stdout: "" }))
  if (listed.stdout.trim().length === 0) return "noEffect"
  await git(workspaceDir, ["add", "--", ...step.paths])
  const trailers = [
    `Plane-save-key: ${step.key}`,
    ...step.keptOut.map((path) => `Plane-kept-out: ${path}`),
  ]
  const message = `${step.note}\n\n${trailers.join("\n")}\n`
  const committed = await git(workspaceDir, ["commit", "-m", message]).catch((error: unknown) => {
    const err = error as { stderr?: string }
    if (typeof err.stderr === "string" && /nothing to commit/.test(err.stderr)) return null
    throw error
  })
  if (!committed) return "noEffect"
  return "applied"
}

async function commitGoBack(
  workspaceDir: string,
  step: Extract<Step, { kind: "commitGoBack" }>,
): Promise<"applied" | "noEffect"> {
  await git(workspaceDir, ["read-tree", step.tree])
  await git(workspaceDir, ["checkout-index", "-a", "-f"])
  await git(workspaceDir, ["clean", "-fd"])
  const headTree = (await git(workspaceDir, ["rev-parse", "HEAD^{tree}"])).stdout.trim()
  if (headTree === step.tree) return "noEffect"
  const message = `${step.note}\n\nPlane-went-back-to: ${step.to}\n`
  const committed = await git(workspaceDir, ["commit", "-m", message, "--allow-empty"]).catch(() => null)
  if (!committed) return "noEffect"
  return "applied"
}

async function merge(
  workspaceDir: string,
  step: Extract<Step, { kind: "merge" }>,
): Promise<"applied" | "noEffect"> {
  if (step.picks) {
    await git(workspaceDir, ["merge", "--no-commit", "--no-ff", step.theirs]).catch(() => null)
    for (const [path, pick] of step.picks) {
      if (pick.kind === "ours") await git(workspaceDir, ["checkout", "--ours", "--", path])
      else if (pick.kind === "theirs") await git(workspaceDir, ["checkout", "--theirs", "--", path])
      else {
        await git(workspaceDir, ["cat-file", "-p", pick.id]).then(async (blob) => {
          writeFileSync(join(workspaceDir, path), blob.stdout)
        })
      }
      await git(workspaceDir, ["add", "--", path])
    }
    const message = `Brought in changes\n\nPlane-brought-in: ${step.from}\nPlane-brought-in-clean: false\nPlane-brought-in-count: 1\n`
    const committed = await git(workspaceDir, ["commit", "-m", message]).catch(() => null)
    return committed ? "applied" : "noEffect"
  }
  const merged = await git(workspaceDir, [
    "merge",
    "--no-ff",
    "-m",
    `Brought in changes\n\nPlane-brought-in: ${step.from}\nPlane-brought-in-clean: true\nPlane-brought-in-count: 1\n`,
    step.theirs,
  ]).catch(() => null)
  return merged ? "applied" : "noEffect"
}

async function push(
  workspaceDir: string,
  step: Extract<Step, { kind: "push" }>,
): Promise<"applied" | "noEffect"> {
  const result = await git(workspaceDir, ["push", "origin", `${step.head}:refs/heads/${step.branch}`]).catch(
    (error: unknown) => {
      const err = error as { stderr?: string; message?: string }
      if (typeof err.stderr === "string" && /non-fast-forward|rejected/.test(err.stderr)) return null
      throw error
    },
  )
  return result ? "applied" : "noEffect"
}

async function moveToLive(workspaceDir: string, liveBranch: BranchName, tip: Sha): Promise<"applied" | "noEffect"> {
  await git(workspaceDir, ["checkout", liveBranch])
  await git(workspaceDir, ["merge", "--ff-only", tip]).catch(() => git(workspaceDir, ["reset", "--hard", tip]))
  return "applied"
}

export async function writeBlob(workspaceDir: string, text: string): Promise<string> {
  const tmp = mkdtempSync(join(tmpdir(), "plane-blob-"))
  const file = join(tmp, "blob")
  writeFileSync(file, text)
  const hashed = (await git(workspaceDir, ["hash-object", "-w", file])).stdout.trim()
  rmSync(tmp, { recursive: true, force: true })
  return hashed
}

function parseMade(body: string): Made {
  const save = /Plane-save-key:\s*(\S+)/.exec(body)
  if (save?.[1]) {
    const kept = [...body.matchAll(/Plane-kept-out:\s*(\S+)/g)].map((match) => asFilePath(match[1]!))
    return { kind: "saved", key: asSaveKey(save[1]), keptOut: kept }
  }
  const back = /Plane-went-back-to:\s*(\S+)/.exec(body)
  if (back?.[1]) return { kind: "wentBack", to: asSha(back[1]) }
  const brought = /Plane-brought-in:\s*(live|elsewhere)/.exec(body)
  if (brought?.[1] === "live" || brought?.[1] === "elsewhere") {
    const count = Number.parseInt(/Plane-brought-in-count:\s*(\d+)/.exec(body)?.[1] ?? "1", 10)
    const clean = /Plane-brought-in-clean:\s*true/.test(body)
    return { kind: "broughtIn", from: brought[1], count, clean }
  }
  const answered = /Plane-answered:\s*(\S+)/.exec(body)
  if (answered?.[1]) {
    const key = /Plane-answered-key:\s*(\S+)/.exec(body)?.[1] ?? answered[1]
    return { kind: "answered", question: asQuestionId(answered[1]), key: asSaveKey(key) }
  }
  return { kind: "foreign" }
}

function conflictPaths(mergeTreeOut: string): FilePath[] {
  const paths: FilePath[] = []
  for (const line of mergeTreeOut.split("\n")) {
    const match = /^CONFLICT \(.*\): Merge conflict in (.+)$/.exec(line)
    if (match?.[1]) paths.push(asFilePath(match[1]))
    const changed = /^\+{7} /.test(line)
    void changed
  }
  if (paths.length === 0 && mergeTreeOut.includes("changed in both")) {
    for (const line of mergeTreeOut.split("\n")) {
      const merged = /merged\s+(.+)$/.exec(line)
      if (merged?.[1]) paths.push(asFilePath(merged[1].trim()))
    }
  }
  return [...new Set(paths)]
}

async function detectDefaultBranch(workspaceDir: string): Promise<string> {
  const sym = await git(workspaceDir, ["symbolic-ref", "refs/remotes/origin/HEAD"]).catch(() => null)
  if (sym) {
    const name = sym.stdout.trim().replace(/^refs\/remotes\/origin\//, "")
    if (name.length > 0) return name
  }
  for (const name of ["main", "master"]) {
    const got = await git(workspaceDir, ["rev-parse", "--verify", name]).catch(() => null)
    if (got) return name
  }
  return (await git(workspaceDir, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim()
}

async function git(
  cwd: string,
  args: string[],
  extraEnv?: Record<string, string>,
): Promise<{ stdout: string; stderr: string }> {
  return exec("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? "Plane",
      GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? "plane@local",
      GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? "Plane",
      GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? "plane@local",
      ...extraEnv,
    },
    encoding: "utf8",
  })
}

export { git }
