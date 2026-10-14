import type {
  CardId,
  CheckName,
  Choice,
  FilePath,
  Instant,
  Intent,
  Login,
  Note,
  Person,
  QuestionId,
  Refusal,
  ReviewId,
  Url,
} from "../types.js"

declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type Sha = Brand<string, "Sha">
export type TreeSha = Brand<string, "TreeSha">
export type BlobId = Brand<string, "BlobId">
export type BranchName = Brand<string, "BranchName">
export type SaveKey = Brand<string, "SaveKey">
export type TouchLog = ReadonlySet<FilePath>

export function asSha(value: string): Sha {
  return value as Sha
}
export function asTreeSha(value: string): TreeSha {
  return value as TreeSha
}
export function asBlobId(value: string): BlobId {
  return value as BlobId
}
export function asBranchName(value: string): BranchName {
  return value as BranchName
}
export function asSaveKey(value: string): SaveKey {
  return value as SaveKey
}

export type Facts = {
  me: Person
  live: {
    branch: BranchName
    tip: Sha
    tipTree: TreeSha
    rules: LiveRules
    visibility: "public" | "private"
    url: Url
  }
  draft: DraftFacts
  worktree: {
    head: Sha
    tree: TreeSha
    touched: readonly FilePath[]
    keptOut: readonly FilePath[]
  }
  approval: Approval | null
  offer: { question: QuestionId; files: ReadonlyMap<FilePath, BlobId> } | null
}

export type DraftFacts =
  | { kind: "none" }
  | {
      kind: "open"
      branch: BranchName
      local: Sha
      remote: Sha | null
      commits: NonEmptyCommits
      againstLive: Probe
      againstElsewhere: Probe
      pull: PullFact | null
    }

export type NonEmptyCommits = readonly [CommitFact, ...CommitFact[]]

export type Probe =
  | { kind: "upToDate" }
  | { kind: "clean"; theirs: Sha }
  | { kind: "conflicts"; theirs: Sha; files: readonly [FilePath, ...FilePath[]] }

export type CommitFact = {
  sha: Sha
  parents: readonly [Sha, ...Sha[]]
  tree: TreeSha
  subject: Note
  at: Instant
  made: Made
}

export type Made =
  | { kind: "saved"; key: SaveKey; keptOut: readonly FilePath[] }
  | { kind: "wentBack"; to: Sha }
  | { kind: "broughtIn"; from: "live" | "elsewhere"; count: number; clean: boolean }
  | { kind: "answered"; question: QuestionId; key: SaveKey }
  | { kind: "foreign" }

export type PullFact = {
  number: ReviewId
  url: Url
  state: "open" | "merged" | "closed"
  head: Sha
  marker: CardId | null
  mergeable: "clean" | "blocked" | "behind" | "dirty" | "unstable" | "unknown"
  reviews: {
    missing: number
    requested: readonly Person[]
    changesRequestedBy: readonly Person[]
  }
  checks: { failing: readonly CheckName[]; pending: readonly CheckName[] }
  openedAt: Instant
  mergedAt: Instant | null
}

export type LiveRules = {
  reviewsRequired: number
  checksRequired: readonly CheckName[]
  mergeMethod: "merge" | "squash"
}

export type Approval =
  | { kind: "publish"; card: CardId; version: Sha }
  | { kind: "askForReview"; card: CardId; version: Sha; reviewers: readonly [Login, ...Login[]] }

const grantBrand = Symbol("PublishGrant")
export type PublishGrant = {
  readonly [grantBrand]: true
  card: CardId
  expectedHead: Sha
  pull: ReviewId | null
}

export function issueGrant(fields: {
  card: CardId
  expectedHead: Sha
  pull: ReviewId | null
}): PublishGrant {
  return { [grantBrand]: true, ...fields }
}

export type Picks = ReadonlyMap<
  FilePath,
  { kind: "ours" } | { kind: "theirs" } | { kind: "blob"; id: BlobId }
>

export type Step =
  | {
      kind: "commitSave"
      parent: Sha
      paths: readonly [FilePath, ...FilePath[]]
      note: Note
      key: SaveKey
      keptOut: readonly FilePath[]
    }
  | { kind: "commitGoBack"; parent: Sha; tree: TreeSha; note: Note; to: Sha }
  | { kind: "merge"; ours: Sha; theirs: Sha; from: "live" | "elsewhere"; picks: Picks | null }
  | { kind: "push"; branch: BranchName; head: Sha }
  | { kind: "moveToLive"; tip: Sha }
  | { kind: "openPullRequest"; grant: PublishGrant; title: Note; body: string }
  | {
      kind: "mergePullRequest"
      grant: PublishGrant & { pull: ReviewId }
      method: LiveRules["mergeMethod"]
    }

export type Goal =
  | Intent
  | { kind: "answer"; question: QuestionId; choices: ReadonlyMap<FilePath, Choice> }
  | { kind: "settle" }

export type Decision = { kind: "step"; step: Step } | { kind: "stop"; stop: Stop }

export type Stop =
  | { kind: "settled" }
  | { kind: "published"; pull: ReviewId }
  | { kind: "needsYou" }
  | { kind: "waiting" }
  | { kind: "stale" }
  | { kind: "refused"; reason: Refusal }
