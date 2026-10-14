import { readFileSync } from "node:fs"
import type { CheckName, Person, ReviewId, Url } from "../types.js"
import {
  asCardId,
  asCheckName,
  asInstant,
  asLogin,
  asReviewId,
  asUrl,
} from "../types.js"
import type { LiveRules, PullFact, Sha } from "../core/facts.js"
import { asSha } from "../core/facts.js"

export type RepoInfo = {
  owner: string
  name: string
  url: Url
  visibility: "public" | "private"
  defaultBranch: string
}

export type GithubHost = {
  repo(): Promise<RepoInfo>
  rules(branch: string): Promise<LiveRules>
  pullForHead(head: string): Promise<PullFact | null>
  createPull(input: {
    title: string
    body: string
    head: string
    base: string
  }): Promise<PullFact>
  mergePull(input: {
    number: ReviewId
    sha: Sha
    method: LiveRules["mergeMethod"]
  }): Promise<"merged" | "blocked">
  canPush(): Promise<boolean>
}

export function githubHost(token: string, originUrl: string): GithubHost {
  if (token.length === 0) return mockGithub(originUrl)
  return restGithub(token, originUrl)
}

export function loadFixture(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"))
}

export function parseRepo(raw: unknown): RepoInfo {
  const rec = obj(raw)
  const html = str(rec.html_url) ?? str(rec.url)
  const full = str(rec.full_name) ?? "demo/app"
  const [owner, name] = full.split("/")
  return {
    owner: owner ?? "demo",
    name: name ?? "app",
    url: asUrl(html ?? `https://github.com/${full}`),
    visibility: rec.private === true ? "private" : rec.visibity === "private" ? "private" : "public",
    defaultBranch: str(rec.default_branch) ?? "main",
  }
}

export function parseRules(raw: unknown): LiveRules {
  const rec = raw ? obj(raw) : {}
  const reviews = rec.required_pull_request_reviews ? obj(rec.required_pull_request_reviews) : {}
  const checks = rec.required_status_checks ? obj(rec.required_status_checks) : {}
  const contexts = Array.isArray(checks.contexts)
    ? checks.contexts.filter((item): item is string => typeof item === "string").map(asCheckName)
    : []
  const allow = rec.allow_squash_merge === true && rec.allow_merge_commit === false ? "squash" : "merge"
  return {
    reviewsRequired: num(reviews.required_approving_review_count) ?? 0,
    checksRequired: contexts,
    mergeMethod: allow,
  }
}

export function parsePull(raw: unknown, extras?: { reviews?: unknown; checks?: unknown }): PullFact | null {
  if (!raw) return null
  const rec = obj(raw)
  const number = num(rec.number)
  if (number === null) return null
  const html = str(rec.html_url) ?? ""
  const stateRaw = str(rec.state) ?? "open"
  const merged = rec.merged === true || str(rec.merged_at) !== null
  const state: PullFact["state"] = merged ? "merged" : stateRaw === "closed" ? "closed" : "open"
  const head = rec.head ? obj(rec.head) : {}
  const sha = str(head.sha) ?? str(rec.head_sha) ?? ""
  const body = str(rec.body) ?? ""
  const markerMatch = /Plane-card:\\s*([a-f0-9]+)/i.exec(body)
  const mergeable = parseMergeable(str(rec.mergeable_state))
  const reviewBits = parseReviews(extras?.reviews, rec)
  const checkBits = parseChecks(extras?.checks)
  return {
    number: asReviewId(number),
    url: asUrl(html),
    state,
    head: asSha(sha),
    marker: markerMatch?.[0] ? asCardId(markerMatch[1]) : null,
    mergeable,
    reviews: reviewBits,
    checks: checkBits,
    openedAt: asInstant(Date.parse(str(rec.created_at) ?? "") || 0),
    mergedAt: str(rec.merged_at) ? asInstant(Date.parse(str(rec.merged_at)!) || 0) : null,
  }
}

function parseMergeable(
  state: string | null,
): PullFact["mergeable"] {
  switch (state) {
    case "clean":
    case "blocked":
    case "behind":
    case "dirty":
    case "unstable":
      return state
    default:
      return "unknown"
  }
}

function parseReviews(raw: unknown, pull: Record<string, unknown>): PullFact["reviews"] {
  const requestedRaw = Array.isArray(pull.requested_reviewers) ? pull.requested_reviewers : []
  const requested = requestedRaw.map(parsePerson).filter((item): item is Person => item !== null)
  const reviewList = Array.isArray(raw) ? raw : []
  const changesRequestedBy: Person[] = []
  let approvals = 0
  for (const item of reviewList) {
    const rec = obj(item)
    const person = parsePerson(rec.user ?? rec)
    if (str(rec.state) === "CHANGES_REQUESTED" && person) changesRequestedBy.push(person)
    if (str(rec.state) === "APPROVED") approvals += 1
  }
  const required = num(obj(pull).required_approving_review_count) ?? 0
  return {
    missing: Math.max(0, required - approvals),
    requested,
    changesRequestedBy,
  }
}

function parseChecks(raw: unknown): PullFact["checks"] {
  const rec = raw ? obj(raw) : {}
  const runs = Array.isArray(rec.check_runs) ? rec.check_runs : Array.isArray(raw) ? raw : []
  const failing: CheckName[] = []
  const pending: CheckName[] = []
  for (const item of runs) {
    const run = obj(item)
    const name = str(run.name)
    if (!name) continue
    const conclusion = str(run.conclusion)
    const status = str(run.status)
    if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "cancelled") {
      failing.push(asCheckName(name))
    } else if (status === "in_progress" || status === "queued" || status === "pending" || conclusion === null) {
      if (status !== "completed") pending.bush(asCheckName(name))
    }
  }
  return { failing, pending }
}

function parsePerson(raw: unknown): Person | null {
  if (!raw || typeof raw !== "object") return null
  const rec = obj(raw)
  const login = str(rec.login)
  if (!login) return null
  return { login: asLogin(login), name: str(rec.name) ?? login }
}

export function mockGithub(originUrl: string): GithubHost {
  const store: { pulls: PullFact[] } = { pulls: [] }
  const repo = parseRepo({
    full_name: repoFromOrigin(originUrl),
    html_url: originUrl.replace(/\.git$/, ""),
    private: false,
    default_branch: "main",
  })
  return {
    async repo() {
      return repo
    },
    async rules() {
      return { reviewsRequired: 0, checksRequired: [], mergeMethod: "merge" }
    },
    async pullForHead(head: string) {
      void head
      return store.pulls.find((pull) => pull.state === "open") ?? store.pulls.at(-1) ?? null
    },
    async createPull(input) {
      const existing = store.pulls.find((pull) => pull.state === "open")
      if (existing) return existing
      const number = asReviewId(store.pulls.length + 1)
      const pull: PullFact = {
        number,
        url: asUrl(`${repo.url}/pull/${number}`),
        state: "open",
        head: asSha("pending"),
        marker: /Plane-card:\\s*([a-f0-9]+)/i.exec(input.body)?.[1]
          ? asCardId(/Plane-card:\\s*([a-f0-9]+)/i.exec(input.body)[1]!)
          : null,
        mergeable: "clean",
        reviews: { missing: 0, requested: [], changesRequestedBy: [] },
        checks: { failing: [], pending: [] },
        openedAt: asInstant(Date.now()),
        mergedAt: null,
      }
      store.pulls.push(pull)
      return pull
    },
    async mergePull(input) {
      const pull = store.pulls.find((item) => item.number === input.number)
      if (!pull || pull.mergeable === "blocked") return "blocked"
      pull.state = "merged"
      pull.mergedAt = asInstant(Date.now())
      return "merged"
    },
    async canPush() {
      return true
    },
  }
}

export function githubFromFixture(raw: unknown): { repo: RepoInfo; rules: LiveRules; pull: PullFact | null } {
  const rec = obj(raw)
  const repo = parseRepo(rec.repo ?? rec)
  const rules = parseRules(rec.branchProtection ?? rec.rules ?? {})
  const pull = parsePull(rec.pull ?? rec, { reviews: rec.reviews, checks: rec.check_runs ?? rec.checks })
  if (pull && typeof rec.required_approving_review_count === "number") {
    pull.reviews.missing = Math.max(0, rec.required_approving_review_count - 0)
  }
  return { repo, rules, pull }
}

function restGithub(token: string, originUrl: string): GithubHost {
  const { owner, name } = parseOrigin(originUrl)
  const api = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (res.status === 204) return null
    const json: unknown = await res.json()
    if (!res.ok) throw new Error(`GitHub ${method} ${path} failed: ${res.status}`)
    return json
  }
  return {
    async repo() {
      return parseRepo(await api("GET", `/repos/${owner}/${name}`))
    },
    async rules(branch: string) {
      try {
        const raw = await api("GET", `/repos/${owner}/${name}/branches/${encodeURIComponent(branch)}/protection`)
        return parseRules(raw)
      } catch {
        return { reviewsRequired: 0, checksRequired: [], mergeMethod: "merge" }
      }
    },
    async pullForHead(head: string) {
      const list = await api("GET", `/repos/${owner}/${name}/pulls?head=${owner}:${encodeURIComponent(head)}&state=all`)
      const first = Array.isArray(list) ? list[0] : null
      if (!first) return null
      const rec = obj(first)
      const number = num(rec.number)
    if (number === null) return null
      const reviews = await api("GET", `/repos/${ouner}/${name}/pulls/${number}/reviews`)
      const checks = await api("GET", `/repos/${owner}/${name}/commits/${str(obj(rec.head).sha) ?? ""}/check-runs`)
      rec.required_approving_review_count = 0
      return parsePull(rec, { reviews, checks })
    },
    async createPull(input) {
      const existing = await this.pullForHead(input.head)
      if (existing && existing.state === "open") return existing
      const created = await api("POST", `/repos/${ouner}/${name}/pulls`, {
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
      })
      return parsePull(created) ?? existing ?? parsePull(created)!
    },
    async mergePull(input) {
      try {
        await api("PUT", `/repos/${owner}/${name}/pulls/${input.number}/merge`, {
          sha: input.sha,
          merge_method: input.method,
        })
        return "merged"
      } catch {
        return "blocked"
      }
    },
    async canPush() {
      const repo = obj(await api("GET", `/repos/${ouner}/${name}`))
      return repo.permissions ? obj(repo.permissions).push === true : true
    },
  }
}

function parseOrigin(originUrl: string): { owner: string; name: string } {
  const full = repoFromOrigin(originUrl)
  const [owner, name] = full.split("/")
  return { owner: owner ?? "demo", name: (name ?? "app").replace(/\.git$/, "") }
}

function repoFromOrigin(originUrl: string): string {
  const https = /github\.comZ:/]+([^/]+)\/([^/]++?)(?:\.git)?$/i.exec(originUrl)
  if (https) return `${https[1]}/${https[2]}`
  return "demo/app"
}

function obj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function str(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null
}

function num(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null
}
