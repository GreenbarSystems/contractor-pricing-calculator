import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { githubFromFixture } from "../adapter/github.js"
import type { CommitFact, Facts } from "./facts.js"
import { asBranchName, asSaveKey, asSha, asTreeSha, issueGrant } from "./facts.js"
import {
  approvalCovers,
  decide,
  grant,
  keepOut,
  next,
  project,
  publishCard,
  question,
} from "./plane.js"
import {
  asCardId,
  asCheckName,
  asFilePath,
  asInstant,
  asLogin,
  asNote,
  asUrl,
  asVersionId,
} from "../types.js"

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/github")

const A = asSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
const B = asSha("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
const C = asSha("cccccccccccccccccccccccccccccccccccccccc")
const D = asSha("dddddddddddddddddddddddddddddddddddddddd")
const treeA = asTreeSha("taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
const treeB = asTreeSha("tbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
const treeC = asTreeSha("tccccccccccccccccccccccccccccccccccccccc")

function commit(partial: Partial<CommitFact> & Pick<CommitFact, "sha" | "parents" | "made">): CommitFact {
  return {
    tree: treeA,
    subject: asNote("Turn"),
    at: asInstant(1),
    ...partial,
  }
}

function baseFacts(draft: Facts["draft"], extras?: Partial<Facts>): Facts {
  return {
    me: { login: asLogin("you"), name: "You" },
    live: {
      branch: asBranchName("main"),
      tip: A,
      tipTree: treeA,
      rules: { reviewsRequired: 0, checksRequired: [], mergeMethod: "merge" },
      visibility: "public",
      url: asUrl("https://github.com/demo/app"),
    },
    draft,
    worktree: { head: A, tree: treeA, touched: [], keptOut: [] },
    approval: null,
    offer: null,
    ...extras,
  }
}

describe("keepOut", () => {
  it("splits secrets from touched paths", () => {
    expect(
      keepOut([asFilePath("src/app.tsx"), asFilePath(".env"), asFilePath("id_rsa")]),
    ).toEqual({
      touched: [asFilePath("src/app.tsx")],
      keptOut: [asFilePath(".env"), asFilePath("id_rsa")],
    })
  })
})

describe("approvalCovers", () => {
  it("covers an empty first-parent chain", () => {
    expect(approvalCovers(B, [])).toBe(true)
  })

  it("covers clean live merges on the first-parent chain", () => {
    const since = [
      commit({
        sha: C,
        parents: [B, D],
        made: { kind: "broughtIn", from: "live", count: 1, clean: true },
      }),
    ]
    expect(approvalCovers(B, since)).toBe(true)
  })

  it("does not cover a save after the click", () => {
    const since = [
      commit({
        sha: C,
        parents: [B],
        made: { kind: "saved", key: asSaveKey("k"), keptOut: [] },
      }),
    ]
    expect(approvalCovers(B, since)).toBe(false)
  })

  it("does not cover a picked merge", () => {
    const since = [
      commit({
        sha: C,
        parents: [B, D],
        made: { kind: "broughtIn", from: "live", count: 1, clean: false },
      }),
    ]
    expect(approvalCovers(B, since)).toBe(false)
  })

  it("does not cover a foreign commit", () => {
    const since = [commit({ sha: C, parents: [B], made: { kind: "foreign" } })]
    expect(approvalCovers(B, since)).toBe(false)
  })
})

describe("recorded GitHub JSON", () => {
  it("parses a blocked pull request fixture", () => {
    const raw: unknown = JSON.parse(readFileSync(join(fixtures, "blocked-pr.json"), "utf8"))
    const parsed = githubFromFixture(raw)
    expect(parsed.pull?.number).toBe(17)
    expect(parsed.pull?.mergeable).toBe("blocked")
    expect(parsed.pull?.reviews.changesRequestedBy).toEqual([
      { login: asLogin("sam"), name: "Sam" },
    ])
    expect(parsed.pull?.checks.failing).toEqual([asCheckName("build")])
    expect(parsed.rules.reviewsRequired).toBe(1)
  })

  it("parses a covered first-parent live merge fixture", () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(fixtures, "covered-first-parent-live-merge.json"), "utf8"),
    )
    const parsed = githubFromFixture(raw)
    expect(parsed.pull?.head).toBe(C)
    expect(parsed.pull?.marker).toBe(
      asCardId("1111111111111111111111111111111111111111111111111111111111111111"),
    )
  })
})

describe("next and project", () => {
  it("asks a choose question when live conflicts", () => {
    const facts = baseFacts({
      kind: "open",
      branch: asBranchName("draft/you/1"),
      local: B,
      remote: B,
      commits: [
        commit({ sha: B, parents: [A], tree: treeB, made: { kind: "saved", key: asSaveKey("k"), keptOut: [] } }),
      ],
      againstLive: { kind: "conflicts", theirs: A, files: [asFilePath("src/app.tsx")] },
      againstElsewhere: { kind: "upToDate" },
      pull: null,
    })
    expect(next(facts)).toEqual({
      kind: "yours",
      move: {
        kind: "choose",
        question: question(facts),
      },
    })
    expect(question(facts)?.files[0]?.path).toBe("src/app.tsx")
  })

  it("asks for a fix when GitHub requested changes", () => {
    const raw: unknown = JSON.parse(readFileSync(join(fixtures, "blocked-pr.json"), "utf8"))
    const parsed = githubFromFixture(raw)
    const facts = baseFacts(
      {
        kind: "open",
        branch: asBranchName("draft/you/1"),
        local: B,
        remote: B,
        commits: [
          commit({ sha: B, parents: [A], tree: treeB, made: { kind: "saved", key: asSaveKey("k"), keptOut: [] } }),
        ],
        againstLive: { kind: "upToDate" },
        againstElsewhere: { kind: "upToDate" },
        pull: parsed.pull,
      },
      { live: { ...baseFacts({ kind: "none" }).live, rules: parsed.rules, visibility: "private" } },
    )
    const got = next(facts)
    expect(got.kind).toBe("yours")
    if (got.kind !== "yours") throw new Error("expected yours")
    expect(got.move.kind).toBe("fix")
    if (got.move.kind !== "fix") throw new Error("expected fix")
    expect(got.move.blocker).toEqual({
      kind: "changesRequested",
      by: [{ login: asLogin("sam"), name: "Sam" }],
    })
  })

  it("returns a publish card when the draft differs from live", () => {
    const facts = baseFacts({
      kind: "open",
      branch: asBranchName("draft/you/1"),
      local: B,
      remote: B,
      commits: [
        commit({
          sha: B,
          parents: [A],
          tree: treeB,
          subject: asNote("Turn one"),
          made: { kind: "saved", key: asSaveKey("k"), keptOut: [] },
        }),
      ],
      againstLive: { kind: "upToDate" },
      againstElsewhere: { kind: "upToDate" },
      pull: null,
    })
    const got = next(facts)
    expect(got.kind).toBe("yours")
    if (got.kind !== "yours" || got.move.kind !== "click") throw new Error("expected click")
    expect(got.move.card.kind).toBe("publish")
    expect(got.move.card.upTo.note).toBe("Turn one")
    if (got.move.card.kind !== "publish") throw new Error("publish")
    expect(got.move.card.effects.opensPullRequest).toBe(true)
    const view = project(facts)
    expect(view.draft.kind).toBe("open")
    if (view.draft.kind !== "open") throw new Error("open")
    expect(view.draft.head).toBe(asVersionId(B))
    expect(view.timeline[0]).toMatchObject({ kind: "version", version: asVersionId(B), note: "Turn one" })
  })

  it("waits on GitHub when an approval still covers", () => {
    const facts = baseFacts(
      {
        kind: "open",
        branch: asBranchName("draft/you/1"),
        local: C,
        remote: C,
        commits: [
          commit({
            sha: C,
            parents: [B, D],
            tree: treeC,
            made: { kind: "broughtIn", from: "live", count: 1, clean: true },
          }),
          commit({
            sha: B,
            parents: [A],
            tree: treeB,
            made: { kind: "saved", key: asSaveKey("k"), keptOut: [] },
          }),
        ],
        againstLive: { kind: "upToDate" },
        againstElsewhere: { kind: "upToDate" },
        pull: {
          number: 4 as never,
          url: asUrl("https://github.com/demo/app/pull/4"),
          state: "open",
          head: C,
          marker: asCardId("card"),
          mergeable: "unstable",
          reviews: { missing: 1, requested: [], changesRequestedBy: [] },
          checks: { failing: [], pending: [] },
          openedAt: asInstant(2),
          mergedAt: null,
        },
      },
      { approval: { kind: "publish", card: asCardId("card"), version: B } },
    )
    expect(grant(facts)?.expectedHead).toBe(C)
    const got = next(facts)
    expect(got.kind).toBe("theirs")
    if (got.kind !== "theirs") throw new Error("theirs")
    expect(got.share.url).toBe("https://github.com/demo/app/pull/4")
    expect(got.waitingOn[0]).toEqual({ kind: "reviews", missing: 1, requested: [] })
  })
})

describe("decide", () => {
  it("refuses askForReview in the first slice", () => {
    const facts = baseFacts({ kind: "none" })
    expect(
      decide({ kind: "askForReview", reviewers: [asLogin("sam")] }, facts),
    ).toEqual({
      kind: "stop",
      stop: { kind: "refused", reason: { kind: "notInThisSlice", intent: "askForReview" } },
    })
  })

  it("saves touched paths and refuses secrets-only", () => {
    const facts = baseFacts(
      { kind: "none" },
      { worktree: { head: A, tree: treeA, touched: [asFilePath("src/app.tsx")], keptOut: [] } },
    )
    const saved = decide({ kind: "save", note: asNote("Turn one") }, facts)
    expect(saved.kind).toBe("step")
    if (saved.kind !== "step") throw new Error("step")
    expect(saved.step.kind).toBe("commitSave")

    const secrets = baseFacts(
      { kind: "none" },
      { worktree: { head: A, tree: treeA, touched: [], keptOut: [asFilePath(".env")] } },
    )
    expect(decide({ kind: "save", note: asNote("Turn one") }, secrets)).toEqual({
      kind: "stop",
      stop: { kind: "refused", reason: { kind: "secretsOnly", paths: [asFilePath(".env")] } },
    })
  })

  it("returns a card for publish and does not open a pull request", () => {
    const facts = baseFacts({
      kind: "open",
      branch: asBranchName("draft/you/1"),
      local: B,
      remote: B,
      commits: [
        commit({ sha: B, parents: [A], tree: treeB, made: { kind: "saved", key: asSaveKey("k"), keptOut: [] } }),
      ],
      againstLive: { kind: "upToDate" },
      againstElsewhere: { kind: "upToDate" },
      pull: null,
    })
    expect(decide({ kind: "publish" }, facts)).toEqual({ kind: "stop", stop: { kind: "needsYou" } })
    expect(publishCard(facts)?.kind).toBe("publish")
  })

  it("opens a pull request from settle only after a grant", () => {
    const facts = baseFacts(
      {
        kind: "open",
        branch: asBranchName("draft/you/1"),
        local: B,
        remote: B,
        commits: [
          commit({
            sha: B,
            parents: [A],
            tree: treeB,
            subject: asNote("Turn one"),
            made: { kind: "saved", key: asSaveKey("k"), keptOut: [] },
          }),
        ],
        againstLive: { kind: "upToDate" },
        againstElsewhere: { kind: "upToDate" },
        pull: null,
      },
      { approval: { kind: "publish", card: asCardId("card"), version: B } },
    )
    const decided = decide({ kind: "settle" }, facts)
    expect(decided.kind).toBe("step")
    if (decided.kind !== "step") throw new Error("step")
    expect(decided.step.kind).toBe("openPullRequest")
    void issueGrant
  })
})
