declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type NonEmpty<T> = readonly [T, ...T[]]
export type VersionId = Brand<string, "VersionId">
export type ReviewId = Brand<number, "ReviewId">
export type CardId = Brand<string, "CardId">
export type QuestionId = Brand<string, "QuestionId">
export type Note = Brand<string, "Note">
export type FilePath = Brand<string, "FilePath">
export type Login = Brand<string, "Login">
export type Url = Brand<string, "Url">
export type CheckName = Brand<string, "CheckName">
export type Instant = Brand<number, "Instant">

export type Person = { login: Login; name: string }
export type GitHubLink = {
  noun: "commit" | "branch" | "pullRequest"
  label: string
  url: Url
}
export type Version = { id: VersionId; note: Note }

export type Intent =
  | { kind: "save"; note: Note }
  | { kind: "goBack"; to: VersionId }
  | { kind: "update" }
  | { kind: "askForReview"; reviewers: NonEmpty<Login> }
  | { kind: "publish" }

export type Draft =
  | { kind: "none" }
  | { kind: "open"; head: VersionId; branch: GitHubLink; review: Review }

export type Review =
  | { kind: "none" }
  | { kind: "open"; id: ReviewId; link: GitHubLink }

export type Change =
  | { kind: "saved"; keptOut: readonly FilePath[] }
  | { kind: "wentBack"; to: Version }
  | { kind: "broughtIn"; count: number; from: "live" | "elsewhere" }

export type OnGitHub = { kind: "yes"; link: GitHubLink } | { kind: "notYet" }

export type VersionRow = {
  kind: "version"
  version: VersionId
  note: Note
  change: Change
  at: Instant
  onGitHub: OnGitHub
}
export type ReviewRow = {
  kind: "review"
  review: ReviewId
  event: "opened" | "asked" | "published"
  at: Instant
  link: GitHubLink
}
export type Row = VersionRow | ReviewRow

export type Wait =
  | { kind: "reviews"; missing: number; requested: readonly Person[] }
  | { kind: "checks"; pending: NonEmpty<CheckName> }
  | { kind: "merging" }

export type Blocker =
  | { kind: "changesRequested"; by: NonEmpty<Person> }
  | { kind: "checksFailing"; checks: NonEmpty<CheckName> }
  | { kind: "ruleBlocks"; message: string }

export type Card =
  | { kind: "publish"; id: CardId; upTo: Version; effects: PublishEffects }
  | {
      kind: "askForReview"
      id: CardId
      upTo: Version
      reviewers: NonEmpty<Person>
      opensPullRequest: boolean
    }

export type PublishEffects = {
  opensPullRequest: boolean
  changesLive: { rows: number }
  needs: readonly Wait[]
}

export type Question = {
  id: QuestionId
  thisDraft: Version
  incoming: Version & { from: "live" | "elsewhere" }
  files: NonEmpty<ConflictFile>
}
export type ConflictFile = { path: FilePath; combined: "offered" | "notOffered" }
export type Choice = "thisDraft" | "incoming" | "combined"
export type CombinedFile = { path: FilePath; text: string }

export type Next =
  | { kind: "nothing" }
  | { kind: "yours"; move: YourMove }
  | { kind: "theirs"; waitingOn: NonEmpty<Wait>; share: GitHubLink }

export type YourMove =
  | { kind: "choose"; question: Question }
  | { kind: "fix"; blocker: Blocker; link: GitHubLink }
  | { kind: "click"; card: Card }

export type View = {
  live: { version: VersionId; branch: GitHubLink; visibility: "public" | "private" }
  draft: Draft
  timeline: readonly Row[]
  next: Next
}

export type Refusal =
  | { kind: "notInThisSlice"; intent: "askForReview" }
  | { kind: "unknownVersion"; to: VersionId }
  | { kind: "missingChoices"; paths: NonEmpty<FilePath> }
  | { kind: "combinedNotOffered"; paths: NonEmpty<FilePath> }
  | { kind: "notInQuestion"; paths: NonEmpty<FilePath> }
  | { kind: "secretsOnly"; paths: NonEmpty<FilePath> }
  | { kind: "unreachable"; message: string }

type Outcome =
  | { kind: "done"; row: Row; view: View }
  | { kind: "unchanged"; view: View }
  | { kind: "needsYou"; move: YourMove; view: View }
  | { kind: "waiting"; on: NonEmpty<Wait>; share: GitHubLink; view: View }
  | { kind: "stale"; view: View }
  | { kind: "refused"; reason: Refusal; view: View }
  | { kind: "busy" }

export type RunResult = Exclude<Outcome, { kind: "stale" }>
export type ConfirmResult = Exclude<Outcome, { kind: "unchanged" }>
export type AnswerResult = Extract<
  Outcome,
  { kind: "done" | "unchanged" | "stale" | "refused" | "busy" }
>
export type OfferResult =
  | { kind: "offered"; question: Question }
  | { kind: "stale"; view: View }
  | { kind: "refused"; reason: Refusal }
  | { kind: "busy" }

export type AgentControls = {
  run(intent: Intent): Promise<RunResult>
  offerCombined(question: QuestionId, files: NonEmpty<CombinedFile>): Promise<OfferResult>
  view(): Promise<View>
}

export type HumanControls = AgentControls & {
  confirm(card: CardId): Promise<ConfirmResult>
  answer(question: QuestionId, choices: ReadonlyMap<FilePath, Choice>): Promise<AnswerResult>
  subscribe(onView: (view: View) => void): () => void
}

export type HostHook = {
  turnIdle(): Promise<void>
}

export type OpenResult =
  | {
      kind: "open"
      agent: AgentControls
      human: HumanControls
      noteWrites(paths: readonly string[]): void
      close(): Promise<RunResult>
    }
  | { kind: "locked" }
  | { kind: "notLinked" }
  | { kind: "cannotPush"; repo: GitHubLink }

export type AgentTool = {
  name: keyof AgentControls
  description: string
  inputSchema: JsonSchema
  call(input: unknown): Promise<unknown>
}
export type JsonSchema = { readonly [key: string]: unknown }

export function asNote(text: string): Note {
  const line = text.trim().split("\n")[0]?.trim() ?? ""
  return (line.length > 0 ? line : "Saved") as Note
}

export function asFilePath(path: string): FilePath {
  return path as FilePath
}

export function asLogin(login: string): Login {
  return login as Login
}

export function asUrl(url: string): Url {
  return url as Url
}

export function asVersionId(id: string): VersionId {
  return id as VersionId
}

export function asCardId(id: string): CardId {
  return id as CardId
}

export function asQuestionId(id: string): QuestionId {
  return id as QuestionId
}

export function asReviewId(n: number): ReviewId {
  return n as ReviewId
}

export function asCheckName(name: string): CheckName {
  return name as CheckName
}

export function asInstant(ms: number): Instant {
  return ms as Instant
}

export function asNonEmpty<T>(items: readonly T[]): NonEmpty<T> | null {
  const first = items[0]
  if (first === undefined) return null
  return [first, ...items.slice(1)]
}
