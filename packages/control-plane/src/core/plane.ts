import { createHash } from "node:crypto"
import type {
  Card,
  CardId,
  Change,
  CheckName,
  Choice,
  FilePath,
  GitHubLink,
  Intent,
  Login,
  Next,
  Note,
  NonEmpty,
  OnGitHub,
  PublishEffects,
  Question,
  QuestionId,
  Row,
  Version,
  VersionId,
  View,
  Wait,
} from "../types.js"
import {
  asCardId,
  asFilePath,
  asNonEmpty,
  asNote,
  asQuestionId,
  asUrl,
  asVersionId,
} from "../types.js"
import type {
  CommitFact,
  Decision,
  DraftFacts,
  Facts,
  Goal,
  Made,
  PublishGrant,
  Sha,
  Step,
  Stop,
} from "./facts.js"
import { asSaveKey, issueGrant, type SaveKey } from "./facts.js"

export const intents: {
  readonly [K in Intent["kind"]]: { reach: "yourDraft" | "otherPeople"; ships: "firstSlice" | "later" }
} = {
  save: { reach: "yourDraft", ships: "firstSlice" },
  goBack: { reach: "yourDraft", ships: "firstSlice" },
  update: { reach: "yourDraft", ships: "firstSlice" },
  askForReview: { reach: "otherPeople", ships: "later" },
  publish: { reach: "otherPeople", ships: "firstSlice" },
}

const SECRET_NAME =
  /(^|\/)(\.env($|\..*)|.*\.(pem|key|p12|pfx)|id_rsa|id_ed25519|credentials(\..*)?|secrets(\..*)?)$/i

export function keepOut(paths: readonly FilePath[]): {
  touched: FilePath[]
  keptOut: FilePath[]
} {
  const touched: FilePath[] = []
  const keptOut: FilePath[] = []
  for (const path of paths) {
    if (SECRET_NAME.test(path)) keptOut.push(path)
    else touched.push(path)
  }
  return { touched, keptOut }
}

export function draftBranch(login: Login, n: number): string {
  return `draft/${login}/${n}`
}

export function cardId(action: "publish" | "askForReview", branch: string, version: Sha): CardId {
  return asCardId(digest(`card:${action}:${branch}:${version}`))
}

export function questionId(thisDraft: Sha, incoming: Sha): QuestionId {
  return asQuestionId(digest(`question:${thisDraft}:${incoming}`))
}

export function saveKey(parent: Sha, tree: string, note: Note, paths: readonly FilePath[]): SaveKey {
  return asSaveKey(digest(`save:${parent}:${tree}:${note}:${[...paths].sort().join(",")}`))
}

export function approvalCovers(approved: Sha, since: readonly CommitFact[]): boolean {
  if (since.length === 0) return true
  const bySha = new Map(since.map((commit) => [commit.sha, commit]))
  const head = since[0]
  if (!head) return true
  let current: CommitFact | undefined = head
  const seen = new Set<Sha>()
  while (current) {
    if (seen.has(current.sha)) return false
    seen.add(current.sha)
    if (current.sha === approved) return true
    if (!isCoveringUpdate(current.made)) return false
    const parent: Sha | undefined = current.parents[0]
    if (parent === approved) return true
    current = parent === undefined ? undefined : bySha.get(parent)
  }
  return false
}

export function grant(facts: Facts): PublishGrant | null {
  const approval = facts.approval
  if (!approval || approval.kind !== "publish") return null
  if (facts.draft.kind !== "open") return null
  const since = commitsAfter(facts.draft.commits, approval.version)
  if (!approvalCovers(approval.version, since)) return null
  const pull = facts.draft.pull
  return issueGrant({
    card: approval.card,
    expectedHead: facts.draft.local,
    pull: pull && pull.state === "open" ? pull.number : null,
  })
}

export function question(facts: Facts): Question | null {
  const draft = facts.draft
  if (draft.kind !== "open") return null
  const elsewhere = draft.againstElsewhere
  const live = draft.againstLive
  const conflict =
    elsewhere.kind === "conflicts"
      ? { probe: elsewhere, from: "elsewhere" as const }
      : live.kind === "conflicts"
        ? { probe: live, from: "live" as const }
        : null
  if (!conflict) return null
  const theirs = conflict.probe.theirs
  const files = conflict.probe.files.map((path) => ({
    path,
    combined:
      facts.offer?.question === questionId(draft.local, theirs) && facts.offer.files.has(path)
        ? ("offered" as const)
        : ("notOffered" as const),
  }))
  const nonempty = asNonEmpty(files)
  if (!nonempty) return null
  const head = draft.commits[0]
  if (!head) return null
  return {
    id: questionId(draft.local, theirs),
    thisDraft: versionOf(head),
    incoming: { ...incomingVersion(facts, theirs, conflict.from), from: conflict.from },
    files: nonempty,
  }
}

export function publishCard(facts: Facts): Card | null {
  if (facts.draft.kind !== "open") return null
  const head = facts.draft.commits[0]
  if (!head) return null
  const waits: Wait[] = []
  if (facts.live.rules.reviewsRequired > 0) {
    const missing = Math.max(
      0,
      facts.live.rules.reviewsRequired - (facts.draft.pull ? Math.max(0, facts.live.rules.reviewsRequired - facts.draft.pull.reviews.missing) : 0),
    )
    const still = facts.draft.pull?.reviews.missing ?? facts.live.rules.reviewsRequired
    if (still > 0) {
      waits.push({
        kind: "reviews",
        missing: still,
        requested: facts.draft.pull?.reviews.requested ?? [],
      })
    }
    void missing
  }
  const pendingChecks = pendingRequiredChecks(facts)
  if (pendingChecks) waits.push({ kind: "checks", pending: pendingChecks })
  const effects: PublishEffects = {
    opensPullRequest: facts.draft.pull === null || facts.draft.pull.state !== "open",
    changesLive: { rows: facts.draft.commits.filter((c) => c.made.kind !== "foreign").length },
    needs: waits,
  }
  return {
    kind: "publish",
    id: cardId("publish", facts.draft.branch, facts.draft.local),
    upTo: versionOf(head),
    effects,
  }
}

export function next(facts: Facts): Next {
  const conflict = question(facts)
  if (conflict) return { kind: "yours", move: { kind: "choose", question: conflict } }

  const fix = pullFix(facts)
  if (fix) return { kind: "yours", move: fix }

  const covered = grant(facts)
  if (covered && facts.draft.kind === "open" && facts.draft.pull && facts.draft.pull.state === "open") {
    const waitingOn = waitsOf(facts)
    if (waitingOn) {
      return {
        kind: "theirs",
        waitingOn,
        share: pullLink(facts.draft.pull.url),
      }
    }
  }

  if (facts.draft.kind === "open" && facts.draft.local !== facts.live.tip) {
    const card = publishCard(facts)
    if (card) return { kind: "yours", move: { kind: "click", card } }
  }
  return { kind: "nothing" }
}

export function project(facts: Facts): View {
  const liveLink: GitHubLink = {
    noun: "branch",
    label: "Open on GitHub",
    url: asUrl(facts.live.url),
  }
  const timeline = timelineOf(facts)
  const draft: View["draft"] =
    facts.draft.kind === "none"
      ? { kind: "none" }
      : {
          kind: "open",
          head: asVersionId(facts.draft.local),
          branch: {
            noun: "branch",
            label: "Open on GitHub",
            url: asUrl(branchUrl(facts.live.url, facts.draft.branch)),
          },
          review:
            facts.draft.pull && facts.draft.pull.state === "open"
              ? {
                  kind: "open",
                  id: facts.draft.pull.number,
                  link: pullLink(facts.draft.pull.url),
                }
              : { kind: "none" },
        }
  return {
    live: {
      version: asVersionId(facts.live.tip),
      branch: liveLink,
      visibility: facts.live.visibility,
    },
    draft,
    timeline,
    next: next(facts),
  }
}

export function decide(goal: Goal, facts: Facts): Decision {
  if (goal.kind === "askForReview" || (goal.kind in intents && intents[goal.kind as Intent["kind"]]?.ships === "later")) {
    return stop({ kind: "refused", reason: { kind: "notInThisSlice", intent: "askForReview" } })
  }
  const unpublished = decidePush(facts)
  if (unpublished) return unpublished
  const elsewhere = decideElsewhere(facts)
  if (elsewhere) return elsewhere
  switch (goal.kind) {
    case "save":
      return decideSave(goal.note, facts)
    case "goBack":
      return decideGoBack(goal.to, facts)
    case "update":
      return decideBringLive(facts)
    case "answer":
      return decideAnswer(goal.question, goal.choices, facts)
    case "publish":
      return decidePublish(facts)
    case "settle":
      return decideSettle(facts)
    default: {
      const _never: never = goal
      return _never
    }
  }
}

function decidePush(facts: Facts): Decision | null {
  if (facts.draft.kind !== "open") return null
  if (facts.draft.remote === facts.draft.local) return null
  if (facts.draft.againstElsewhere.kind === "conflicts") return null
  if (facts.draft.againstElsewhere.kind === "clean") return null
  return step({ kind: "push", branch: facts.draft.branch, head: facts.draft.local })
}

function decideElsewhere(facts: Facts): Decision | null {
  if (facts.draft.kind !== "open") return null
  const probe = facts.draft.againstElsewhere
  if (probe.kind === "conflicts") return stop({ kind: "needsYou" })
  if (probe.kind === "clean") {
    return step({ kind: "merge", ours: facts.draft.local, theirs: probe.theirs, from: "elsewhere", picks: null })
  }
  return null
}

function decideSave(note: Note, facts: Facts): Decision {
  const touched = asNonEmpty(facts.worktree.touched)
  if (!touched) {
    const secrets = asNonEmpty(facts.worktree.keptOut)
    if (secrets) return stop({ kind: "refused", reason: { kind: "secretsOnly", paths: secrets } })
    return stop({ kind: "settled" })
  }
  return step({
    kind: "commitSave",
    parent: facts.worktree.head,
    paths: touched,
    note,
    key: saveKey(facts.worktree.head, facts.worktree.tree, note, touched),
    keptOut: facts.worktree.keptOut,
  })
}

function decideGoBack(to: VersionId, facts: Facts): Decision {
  const dirty = asNonEmpty(facts.worktree.touched)
  if (dirty) {
    return decideSave(asNoteFromExisting(facts), facts)
  }
  const target = resolveVersion(to, facts)
  if (!target) return stop({ kind: "refused", reason: { kind: "unknownVersion", to } })
  if (facts.worktree.tree === target.tree) return stop({ kind: "settled" })
  return step({
    kind: "commitGoBack",
    parent: facts.worktree.head,
    tree: target.tree,
    note: target.subject,
    to: target.sha,
  })
}

function decideBringLive(facts: Facts): Decision {
  if (facts.draft.kind !== "open") return stop({ kind: "settled" })
  const probe = facts.draft.againstLive
  if (probe.kind === "conflicts") return stop({ kind: "needsYou" })
  if (probe.kind === "clean") {
    return step({ kind: "merge", ours: facts.draft.local, theirs: probe.theirs, from: "live", picks: null })
  }
  return stop({ kind: "settled" })
}

function decideAnswer(
  id: QuestionId,
  choices: ReadonlyMap<FilePath, Choice>,
  facts: Facts,
): Decision {
  const current = question(facts)
  if (!current || current.id !== id) return stop({ kind: "stale" })
  if (facts.draft.kind !== "open") return stop({ kind: "stale" })
  const missing: FilePath[] = []
  const notOffered: FilePath[] = []
  const extra: FilePath[] = []
  const known = new Set(current.files.map((file) => file.path))
  for (const file of current.files) {
    const choice = choices.get(file.path)
    if (!choice) missing.push(file.path)
    else if (choice === "combined" && file.combined === "notOffered") notOffered.push(file.path)
  }
  for (const path of choices.keys()) {
    if (!known.has(path)) extra.push(path)
  }
  const missingList = asNonEmpty(missing)
  if (missingList) return stop({ kind: "refused", reason: { kind: "missingChoices", paths: missingList } })
  const notOfferedList = asNonEmpty(notOffered)
  if (notOfferedList) {
    return stop({ kind: "refused", reason: { kind: "combinedNotOffered", paths: notOfferedList } })
  }
  const extraList = asNonEmpty(extra)
  if (extraList) return stop({ kind: "refused", reason: { kind: "notInQuestion", paths: extraList } })
  const head = facts.draft.commits[0]
  if (head?.made.kind === "answered" && head.made.question === id) {
    return stop({ kind: "settled" })
  }
  const probe = facts.draft.againstElsewhere.kind === "conflicts"
    ? facts.draft.againstElsewhere
    : facts.draft.againstLive
  if (probe.kind !== "conflicts") return stop({ kind: "stale" })
  const picks = new Map() as Map<
    FilePath,
    { kind: "ours" } | { kind: "theirs" } | { kind: "blob"; id: import("./facts.js").BlobId }
  >
  for (const file of current.files) {
    const choice = choices.get(file.path)
    if (choice === "thisDraft") picks.set(file.path, { kind: "ours" })
    else if (choice === "incoming") picks.set(file.path, { kind: "theirs" })
    else {
      const blob = facts.offer?.files.get(file.path)
      if (!blob) {
        return stop({
          kind: "refused",
          reason: { kind: "combinedNotOffered", paths: [file.path] },
        })
      }
      picks.set(file.path, { kind: "blob", id: blob })
    }
  }
  return step({
    kind: "merge",
    ours: facts.draft.local,
    theirs: probe.theirs,
    from: current.incoming.from,
    picks,
  })
}

function decidePublish(facts: Facts): Decision {
  if (facts.draft.kind !== "open") return stop({ kind: "settled" })
  const live = facts.draft.againstLive
  if (live.kind === "conflicts") return stop({ kind: "needsYou" })
  if (live.kind === "clean") {
    return step({ kind: "merge", ours: facts.draft.local, theirs: live.theirs, from: "live", picks: null })
  }
  if (grant(facts)) return stop({ kind: "waiting" })
  return stop({ kind: "needsYou" })
}

function decideSettle(facts: Facts): Decision {
  const restore = interruptedGoBack(facts)
  if (restore) return restore
  if (facts.draft.kind === "open") {
    const live = facts.draft.againstLive
    if (live.kind === "conflicts") return stop({ kind: "needsYou" })
    if (live.kind === "clean") {
      return step({ kind: "merge", ours: facts.draft.local, theirs: live.theirs, from: "live", picks: null })
    }
  }
  const covered = grant(facts)
  if (!covered) return stop({ kind: "settled" })
  if (facts.draft.kind !== "open") return stop({ kind: "settled" })
  const pull = facts.draft.pull
  if (pull?.state === "merged") return stop({ kind: "published", pull: pull.number })
  if (!pull || pull.state !== "open") {
    const head = facts.draft.commits[0]
    if (!head) return stop({ kind: "settled" })
    return step({
      kind: "openPullRequest",
      grant: covered,
      title: head.subject,
      body: pullBody(covered.card, facts),
    })
  }
  const fix = pullFix(facts)
  if (fix) return stop({ kind: "needsYou" })
  const waitingOn = waitsOf(facts)
  if (waitingOn) return stop({ kind: "waiting" })
  if (pull.mergeable === "clean" || pull.mergeable === "unstable" || pull.mergeable === "unknown") {
    if (covered.pull === null) return stop({ kind: "waiting" })
    return step({
      kind: "mergePullRequest",
      grant: { ...covered, pull: covered.pull },
      method: facts.live.rules.mergeMethod,
    })
  }
  if (pull.mergeable === "behind") {
    const live = facts.draft.againstLive
    if (live.kind === "clean") {
      return step({ kind: "merge", ours: facts.draft.local, theirs: live.theirs, from: "live", picks: null })
    }
  }
  return stop({ kind: "waiting" })
}

function interruptedGoBack(facts: Facts): Decision | null {
  if (facts.draft.kind !== "open") return null
  if (facts.worktree.tree === facts.draft.commits[0]?.tree) return null
  const match = facts.draft.commits.find((commit) => commit.tree === facts.worktree.tree)
  if (!match) return null
  if (match.sha === facts.worktree.head) return null
  return step({
    kind: "commitGoBack",
    parent: facts.worktree.head,
    tree: match.tree,
    note: match.subject,
    to: match.sha,
  })
}

function pullFix(facts: Facts): Extract<Next, { kind: "yours" }>["move"] | null {
  if (facts.draft.kind !== "open" || !facts.draft.pull || facts.draft.pull.state !== "open") return null
  const pull = facts.draft.pull
  const by = asNonEmpty(pull.reviews.changesRequestedBy)
  if (by) {
    return { kind: "fix", blocker: { kind: "changesRequested", by }, link: pullLink(pull.url) }
  }
  const failing = asNonEmpty(pull.checks.failing)
  if (failing) {
    return { kind: "fix", blocker: { kind: "checksFailing", checks: failing }, link: pullLink(pull.url) }
  }
  if (pull.mergeable === "blocked" && !waitsOf(facts)) {
    return {
      kind: "fix",
      blocker: { kind: "ruleBlocks", message: "GitHub blocked the merge." },
      link: pullLink(pull.url),
    }
  }
  return null
}

function waitsOf(facts: Facts): NonEmpty<Wait> | null {
  if (facts.draft.kind !== "open" || !facts.draft.pull) return null
  const pull = facts.draft.pull
  const waits: Wait[] = []
  if (pull.reviews.missing > 0) {
    waits.push({
      kind: "reviews",
      missing: pull.reviews.missing,
      requested: pull.reviews.requested,
    })
  }
  const pending = asNonEmpty(pull.checks.pending)
  if (pending) waits.push({ kind: "checks", pending })
  if (pull.mergeable === "unstable" && waits.length === 0) waits.push({ kind: "merging" })
  return asNonEmpty(waits)
}

function pendingRequiredChecks(facts: Facts): NonEmpty<CheckName> | null {
  const required = facts.live.rules.checksRequired
  if (required.length === 0) return null
  if (facts.draft.kind !== "open" || !facts.draft.pull) {
    return asNonEmpty(required)
  }
  const pending = required.filter(
    (name) =>
      facts.draft.kind === "open" &&
      facts.draft.pull !== null &&
      !facts.draft.pull.checks.failing.includes(name) &&
      facts.draft.pull.checks.pending.includes(name),
  )
  return asNonEmpty(pending.length > 0 ? pending : required.filter(() => facts.draft.kind === "open" && facts.draft.pull === null))
}

function timelineOf(facts: Facts): readonly Row[] {
  const versionRows: Row[] = []
  if (facts.draft.kind === "open") {
    for (const commit of facts.draft.commits) {
      if (commit.made.kind === "foreign") continue
      versionRows.push(versionRow(commit, facts.draft, facts.live.url))
    }
  }
  const reviewRows: Row[] = []
  const pull =
    facts.draft.kind === "open"
      ? facts.draft.pull
      : null
  if (pull) {
    reviewRows.push({
      kind: "review",
      review: pull.number,
      event: pull.state === "merged" ? "published" : "opened",
      at: pull.state === "merged" && pull.mergedAt ? pull.mergedAt : pull.openedAt,
      link: pullLink(pull.url),
    })
  }
  if (facts.draft.kind === "open") {
    const head = versionRows[0]
    if (!head) return reviewRows
    const rest = [...versionRows.slice(1), ...reviewRows].sort((a, b) => b.at - a.at)
    return [head, ...rest]
  }
  return [...reviewRows, ...versionRows]
}

function versionRow(
  commit: CommitFact,
  draft: Extract<DraftFacts, { kind: "open" }>,
  repoUrl: import("../types.js").Url,
): Row {
  return {
    kind: "version",
    version: asVersionId(commit.sha),
    note: commit.subject,
    change: changeOf(commit),
    at: commit.at,
    onGitHub: onGitHubOf(commit.sha, draft, repoUrl),
  }
}

function changeOf(commit: CommitFact): Change {
  switch (commit.made.kind) {
    case "saved":
    case "answered":
    case "foreign":
      return { kind: "saved", keptOut: commit.made.kind === "saved" ? commit.made.keptOut : [] }
    case "wentBack":
      return {
        kind: "wentBack",
        to: { id: asVersionId(commit.made.to), note: commit.subject },
      }
    case "broughtIn":
      return { kind: "broughtIn", count: commit.made.count, from: commit.made.from }
    default: {
      const _never: never = commit.made
      return _never
    }
  }
}

function onGitHubOf(
  sha: Sha,
  draft: Extract<DraftFacts, { kind: "open" }>,
  repoUrl: import("../types.js").Url,
): OnGitHub {
  if (draft.remote === null) return { kind: "notYet" }
  if (reaches(draft.commits, draft.remote, sha) || sha === draft.remote) {
    return {
      kind: "yes",
      link: {
        noun: "commit",
        label: "Commit",
        url: asUrl(`${String(repoUrl).replace(/\.git$/, "")}/commit/${sha}`),
      },
    }
  }
  return { kind: "notYet" }
}

function reaches(commits: readonly CommitFact[], from: Sha, target: Sha): boolean {
  if (from === target) return true
  const bySha = new Map(commits.map((commit) => [commit.sha, commit]))
  const seen = new Set<Sha>()
  const stack: Sha[] = [from]
  while (stack.length > 0) {
    const sha = stack.pop()
    if (!sha || seen.has(sha)) continue
    seen.add(sha)
    if (sha === target) return true
    const commit = bySha.get(sha)
    if (commit) stack.push(...commit.parents)
  }
  return seen.has(target)
}

function versionOf(commit: CommitFact): Version {
  return { id: asVersionId(commit.sha), note: commit.subject }
}

function incomingVersion(facts: Facts, sha: Sha, from: "live" | "elsewhere"): Version {
  if (from === "live" && facts.live.tip === sha) {
    return { id: asVersionId(sha), note: asNote("Live") }
  }
  if (facts.draft.kind === "open") {
    const found = facts.draft.commits.find((commit) => commit.sha === sha)
    if (found) return versionOf(found)
  }
  return { id: asVersionId(sha), note: asNote("Incoming") }
}

function resolveVersion(
  to: VersionId,
  facts: Facts,
): CommitFact | { sha: Sha; tree: import("./facts.js").TreeSha; subject: Note } | null {
  if (to === asVersionId(facts.live.tip)) {
    const subject =
      facts.draft.kind === "open" ? (facts.draft.commits[0]?.subject ?? asNote("Live")) : asNote("Live")
    return { sha: facts.live.tip, tree: facts.live.tipTree, subject }
  }
  if (facts.draft.kind !== "open") return null
  return facts.draft.commits.find((commit) => asVersionId(commit.sha) === to) ?? null
}

function commitsAfter(commits: readonly CommitFact[], approved: Sha): CommitFact[] {
  const out: CommitFact[] = []
  for (const commit of commits) {
    if (commit.sha === approved) break
    out.push(commit)
  }
  return out
}

function isCoveringUpdate(made: Made): boolean {
  return made.kind === "broughtIn" && made.from === "live" && made.clean
}

function pullLink(url: import("../types.js").Url): GitHubLink {
  return { noun: "pullRequest", label: "Pull request", url }
}

function branchUrl(repoUrl: import("../types.js").Url, branch: string): string {
  const base = repoUrl.replace(/\.git$/, "")
  return `${base}/tree/${branch}`
}

function pullBody(card: CardId, facts: Facts): string {
  const notes =
    facts.draft.kind === "open"
      ? facts.draft.commits
          .filter((commit) => commit.made.kind !== "foreign")
          .map((commit) => `- ${commit.subject}`)
          .join("\n")
      : ""
  return `${notes}\n\nPlane-card: ${card}\n`
}

function asNoteFromExisting(facts: Facts): Note {
  if (facts.draft.kind === "open") {
    const head = facts.draft.commits[0]
    if (head) return head.subject
  }
  return asNote("Saved")
}

function step(step: Step): Decision {
  return { kind: "step", step }
}

function stop(stop: Stop): Decision {
  return { kind: "stop", stop }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
