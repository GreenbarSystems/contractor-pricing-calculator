import type {
  AgentControls,
  AgentTool,
  CardId,
  CombinedFile,
  ConfirmResult,
  HostHook,
  HumanControls,
  Intent,
  JsonSchema,
  NonEmpty,
  OfferResult,
  OpenResult,
  QuestionId,
  Refusal,
  Row,
  RunResult,
  View,
  YourMove,
  Wait,
  GitHubLink,
} from "./types.js"
import { asInstant, asNote, asReviewId } from "./types.js"
import type { Facts, Goal, PublishGrant, Step, Stop } from "./core/facts.js"
import { asBlobId } from "./core/facts.js"
import { decide, grant, keepOut, project, question } from "./core/plane.js"
import {
  applyGit,
  currentBranch,
  currentUser,
  headSha,
  inspectGit,
  liveTip,
  loadCommits,
  probeMerge,
  remoteSha,
  worktreeTree,
  writeBlob,
} from "./adapter/git.js"
import { githubHost, type GithubHost, type RepoInfo } from "./adapter/github.js"
import {
  appendTouched,
  loadState,
  subtractTouched,
  tryLock,
  unlock,
  writeApproval,
  writeOffer,
} from "./adapter/state.js"

export function toNote(text: string) {
  return asNote(text)
}

type Port = {
  read(): Promise<Facts>
  apply(step: Step): Promise<{ kind: "applied" } | { kind: "noEffect" }>
}

type DriveResult =
  | { kind: "done"; row: Row; view: View }
  | { kind: "unchanged"; view: View }
  | { kind: "needsYou"; move: YourMove; view: View }
  | { kind: "waiting"; on: NonEmpty<Wait>; share: GitHubLink; view: View }
  | { kind: "stale"; view: View }
  | { kind: "refused"; reason: Refusal; view: View }

type Flight =
  | { kind: "idle" }
  | { kind: "run"; promise: Promise<DriveResult> }
  | { kind: "confirm"; card: CardId; promise: Promise<ConfirmResult> }

export async function openProject(
  workspaceDir: string,
  github: { token: string },
  host: HostHook,
): Promise<OpenResult> {
  const linked = await inspectGit(workspaceDir)
  if (linked.kind !== "linked") return { kind: "notLinked" }
  const gh = githubHost(github.token, linked.originUrl)
  const canPush = await gh.canPush()
  const repo = await gh.repo()
  if (!canPush) {
    return {
      kind: "cannotPush",
      repo: { noun: "branch", label: "Open on GitHub", url: repo.url },
    }
  }
  const lock = tryLock(workspaceDir, process.pid)
  if (lock === "locked") return { kind: "locked" }

  const port = makePort(workspaceDir, gh, repo, linked.defaultBranch)
  const confirmDone = new Map<CardId, ConfirmResult>()
  let flight: Flight = { kind: "idle" }
  const listeners = new Set<(view: View) => void>()
  let poll: ReturnType<typeof setInterval> | null = null

  const emit = async () => {
    const view = project(await port.read())
    for (const listener of listeners) listener(view)
    return view
  }

  const runDrive = async (goal: Goal) => {
    const result = await drive(goal, port)
    await emit()
    return result
  }

  await runDrive({ kind: "settle" })

  const takeRun = async (fn: () => Promise<DriveResult>): Promise<DriveResult | { kind: "busy" }> => {
    if (flight.kind !== "idle") return { kind: "busy" }
    const promise = fn().finally(() => {
      flight = { kind: "idle" }
    })
    flight = { kind: "run", promise }
    return promise
  }

  const asRun = (result: DriveResult | { kind: "busy" }): RunResult => {
    if (result.kind === "stale") {
      return { kind: "refused", reason: { kind: "unreachable", message: "stale" }, view: result.view }
    }
    return result
  }

  const takeConfirm = async (card: CardId, fn: () => Promise<ConfirmResult>): Promise<ConfirmResult> => {
    const prior = confirmDone.get(card)
    if (prior) return prior
    if (flight.kind === "confirm" && flight.card === card) return flight.promise
    if (flight.kind !== "idle") return { kind: "busy" }
    const promise = fn().finally(() => {
      flight = { kind: "idle" }
    })
    flight = { kind: "confirm", card, promise }
    const result = await promise
    confirmDone.set(card, result)
    return result
  }

  const agent: AgentControls = {
    async run(intent: Intent) {
      return asRun(await takeRun(() => runDrive(intent)))
    },
    async offerCombined(questionId: QuestionId, files: NonEmpty<CombinedFile>): Promise<OfferResult> {
      if (flight.kind !== "idle") return { kind: "busy" }
      flight = { kind: "run", promise: Promise.resolve({ kind: "unchanged", view: await agent.view() }) }
      try {
        const facts = await port.read()
        const current = question(facts)
        if (!current || current.id !== questionId) {
          return { kind: "stale", view: project(facts) }
        }
        const blobs = new Map()
        for (const file of files) {
          blobs.set(file.path, asBlobId(await writeBlob(workspaceDir, file.text)))
        }
        writeOffer(workspaceDir, { question: questionId, files: blobs })
        const nextFacts = await port.read()
        const q = question(nextFacts)
        if (!q) return { kind: "stale", view: project(nextFacts) }
        return { kind: "offered", question: q }
      } finally {
        flight = { kind: "idle" }
      }
    },
    async view() {
      return project(await port.read())
    },
  }

  const human: HumanControls = {
    async run(intent: Intent) {
      await host.turnIdle()
      return agent.run(intent)
    },
    async offerCombined(id, files) {
      await host.turnIdle()
      return agent.offerCombined(id, files)
    },
    async view() {
      return agent.view()
    },
    async confirm(card: CardId) {
      await host.turnIdle()
      return takeConfirm(card, async () => {
        const facts = await port.read()
        const view = project(facts)
        if (view.next.kind !== "yours" || view.next.move.kind !== "click" || view.next.move.card.id !== card) {
          if (grant(facts)?.card === card) {
            const driven = await drive({ kind: "settle" }, port)
            return driven.kind === "unchanged" ? { kind: "stale", view: driven.view } : driven
          }
          return { kind: "stale", view }
        }
        if (facts.draft.kind !== "open") return { kind: "stale", view }
        writeApproval(workspaceDir, { kind: "publish", card, version: facts.draft.local })
        const driven = await drive({ kind: "settle" }, port)
        return driven.kind === "unchanged" ? { kind: "stale", view: driven.view } : driven
      })
    },
    async answer(questionId, choices) {
      await host.turnIdle()
      const result = await takeRun(() => runDrive({ kind: "answer", question: questionId, choices }))
      if (result.kind === "needsYou" || result.kind === "waiting") {
        return { kind: "stale", view: result.view }
      }
      return result
    },
    subscribe(onView) {
      listeners.add(onView)
      void emit()
      return () => {
        listeners.delete(onView)
      }
    },
  }

  const startPoll = () => {
    if (poll) return
    poll = setInterval(() => {
      void (async () => {
        if (flight.kind !== "idle") return
        const facts = await port.read()
        if (!grant(facts)) return
        await host.turnIdle()
        if (flight.kind !== "idle") return
        await takeRun(() => runDrive({ kind: "settle" }))
      })()
    }, 30_000)
  }
  startPoll()

  return {
    kind: "open",
    agent,
    human,
    noteWrites(paths: readonly string[]) {
      appendTouched(workspaceDir, paths)
    },
    async close() {
      if (poll) {
        clearInterval(poll)
        poll = null
      }
      const facts = await port.read()
      const result =
        facts.worktree.touched.length > 0
          ? asRun(await takeRun(() => runDrive({ kind: "save", note: toNote("Saved") })))
          : { kind: "unchanged" as const, view: project(facts) }
      unlock(workspaceDir)
      return result
    },
  }
}

export function agentTools(agent: AgentControls): readonly AgentTool[] {
  return [
    {
      name: "run",
      description: "Save the draft, go back to a version, bring in published changes, or show a publish card.",
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["save", "goBack", "update", "publish"] },
          note: { type: "string" },
          to: { type: "string" },
        },
        required: ["kind"],
      } satisfies JsonSchema,
      async call(input: unknown) {
        const rec = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
        const kind = rec.kind
        if (kind === "save") return agent.run({ kind: "save", note: toNote(String(rec.note ?? "Saved")) })
        if (kind === "goBack") return agent.run({ kind: "goBack", to: rec.to as never })
        if (kind === "update") return agent.run({ kind: "update" })
        if (kind === "publish") return agent.run({ kind: "publish" })
        return { kind: "refused", reason: { kind: "unreachable", message: "Unknown tool input." } }
      },
    },
    {
      name: "offerCombined",
      description: "Offer combined file text for a conflict question.",
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string" },
          files: { type: "array" },
        },
        required: ["question", "files"],
      } satisfies JsonSchema,
      async call(input: unknown) {
        const rec = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
        return { offered: rec }
      },
    },
    {
      name: "view",
      description: "Read the current draft, live version, timeline, and next move.",
      inputSchema: { type: "object", properties: {} } satisfies JsonSchema,
      async call() {
        return agent.view()
      },
    },
  ]
}

async function drive(goal: Goal, port: Port): Promise<DriveResult> {
  let appliedAny = false
  let facts = await port.read()
  for (let n = 0; n < 16; n++) {
    if (n > 0) facts = await port.read()
    const decision = decide(goal, facts)
    if (decision.kind === "stop") return outcomeFrom(decision.stop, project(facts), appliedAny)
    const applied = await port.apply(decision.step)
    if (applied.kind === "applied") appliedAny = true
  }
  throw new Error("decide looped past 16 steps")
}

function outcomeFrom(stop: Stop, view: View, appliedAny: boolean): DriveResult {
  switch (stop.kind) {
    case "settled": {
      if (!appliedAny) return { kind: "unchanged", view }
      const row = view.timeline[0]
      if (row) return { kind: "done", row, view }
      if (view.draft.kind === "none") {
        return {
          kind: "done",
          row: {
            kind: "review",
            review: asReviewId(1),
            event: "published",
            at: asInstant(Date.now()),
            link: { noun: "pullRequest", label: "Pull request", url: view.live.branch.url },
          },
          view,
        }
      }
      return { kind: "unchanged", view }
    }
    case "published": {
      const row = view.timeline.find((item) => item.kind === "review") ?? view.timeline[0]
      if (!row) return { kind: "unchanged", view }
      return { kind: "done", row, view }
    }
    case "needsYou": {
      if (view.next.kind !== "yours") {
        return { kind: "refused", reason: { kind: "unreachable", message: "needsYou without a move" }, view }
      }
      return { kind: "needsYou", move: view.next.move, view }
    }
    case "waiting": {
      if (view.next.kind === "theirs") {
        return { kind: "waiting", on: view.next.waitingOn, share: view.next.share, view }
      }
      if (view.draft.kind === "open" && view.draft.review.kind === "open") {
        return {
          kind: "waiting",
          on: [{ kind: "merging" }],
          share: view.draft.review.link,
          view,
        }
      }
      if (view.draft.kind === "open") {
        return {
          kind: "waiting",
          on: [{ kind: "merging" }],
          share: view.draft.branch,
          view,
        }
      }
      return { kind: "unchanged", view }
    }
    case "stale":
      return { kind: "stale", view }
    case "refused":
      return { kind: "refused", reason: stop.reason, view }
    default: {
      const _never: never = stop
      return _never
    }
  }
}

function makePort(workspaceDir: string, gh: GithubHost, repo: RepoInfo, liveBranch: import("./core/facts.js").BranchName): Port {
  return {
    async read(): Promise<Facts> {
      const me = await currentUser(workspaceDir)
      const live = await liveTip(workspaceDir, liveBranch)
      const rules = await gh.rules(liveBranch)
      const state = loadState(workspaceDir)
      const branch = await currentBranch(workspaceDir)
      const head = await headSha(workspaceDir)
      const tree = await worktreeTree(workspaceDir)
      const split = keepOut([...state.touched])
      const onDraft = branch !== liveBranch
      if (!onDraft) {
        return {
          me,
          live: {
            branch: liveBranch,
            tip: live.sha,
            tipTree: live.tree,
            rules,
            visibility: repo.visibility,
            url: repo.url,
          },
          draft: { kind: "none" },
          worktree: { head, tree, touched: split.touched, keptOut: split.keptOut },
          approval: state.approval,
          offer: state.offer,
        }
      }
      const commits = await loadCommits(workspaceDir, branch)
      const nonempty = commits[0] ? ([commits[0], ...commits.slice(1)] as const) : null
      if (!nonempty) {
        return {
          me,
          live: {
            branch: liveBranch,
            tip: live.sha,
            tipTree: live.tree,
            rules,
            visibility: repo.visibility,
            url: repo.url,
          },
          draft: { kind: "none" },
          worktree: { head, tree, touched: split.touched, keptOut: split.keptOut },
          approval: state.approval,
          offer: state.offer,
        }
      }
      const remote = await remoteSha(workspaceDir, branch)
      const local = nonempty[0].sha
      const againstLive = await probeMerge(workspaceDir, local, live.sha)
      const againstElsewhere = remote ? await probeMerge(workspaceDir, local, remote) : { kind: "upToDate" as const }
      const pull = await gh.pullForHead(branch)
      return {
        me,
        live: {
          branch: liveBranch,
          tip: live.sha,
          tipTree: live.tree,
          rules,
          visibility: repo.visibility,
          url: repo.url,
        },
        draft: {
          kind: "open",
          branch,
          local,
          remote,
          commits: nonempty,
          againstLive,
          againstElsewhere,
          pull,
        },
        worktree: { head, tree, touched: split.touched, keptOut: split.keptOut },
        approval: state.approval,
        offer: state.offer,
      }
    },
    async apply(step: Step) {
      if (step.kind === "openPullRequest") {
        const facts = await this.read()
        if (facts.draft.kind !== "open") return { kind: "noEffect" }
        if (!grant(facts)) return { kind: "noEffect" }
        await gh.createPull({
          title: step.title,
          body: step.body,
          head: facts.draft.branch,
          base: facts.live.branch,
        })
        return { kind: "applied" }
      }
      if (step.kind === "mergePullRequest") {
        const merged = await gh.mergePull({
          number: step.grant.pull,
          sha: step.grant.expectedHead,
          method: step.method,
        })
        if (merged !== "merged") return { kind: "noEffect" }
        writeApproval(workspaceDir, null)
        await applyGit(workspaceDir, liveBranch, await currentUser(workspaceDir), {
          kind: "moveToLive",
          tip: step.grant.expectedHead,
        })
        return { kind: "applied" }
      }
      const me = await currentUser(workspaceDir)
      const applied = await applyGit(workspaceDir, liveBranch, me, step)
      if (applied === "applied" && step.kind === "commitSave") {
        subtractTouched(workspaceDir, step.paths)
      }
      return { kind: applied }
    },
  }
}
