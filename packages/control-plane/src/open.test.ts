import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { openProject, toNote } from "./open.js"
import { asVersionId } from "./types.js"

const dirs: string[] = []

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Plane",
      GIT_AUTHOR_EMAIL: "plane@local",
      GIT_COMMITTER_NAME: "Plane",
      GIT_COMMITTER_EMAIL: "plane@local",
    },
  })
}

function repo(): { work: string; bare: string } {
  const root = mkdtempSync(join(tmpdir(), "plane-"))
  dirs.push(root)
  const bare = join(root, "origin.git")
  const work = join(root, "work")
  execFileSync("git", ["init", "--bare", bare], { encoding: "utf8" })
  mkdirSync(work)
  git(work, ["init"])
  git(work, ["checkout", "-b", "main"])
  git(work, ["config", "user.name", "You"])
  git(work, ["config", "user.email", "you@local"])
  writeFileSync(join(work, "index.html"), "<h1>Live</h1>\n")
  git(work, ["add", "index.html"])
  git(work, ["commit", "-m", "live"])
  git(work, ["remote", "add", "origin", bare])
  git(work, ["push", "-u", "origin", "main"])
  return { work, bare }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("openProject loop", () => {
  it("saves three turns as three commits on the draft branch", async () => {
    const { work } = repo()
    const opened = await openProject(work, { token: "" }, { turnIdle: async () => undefined })
    expect(opened.kind).toBe("open")
    if (opened.kind !== "open") throw new Error("open")
    for (const [i, note] of ["Turn one", "Turn two", "Turn three"].entries()) {
      writeFileSync(join(work, "index.html"), `<h1>Turn ${i + 1}</h1>\n`)
      opened.noteWrites(["index.html"])
      const result = await opened.agent.run({ kind: "save", note: toNote(note) })
      expect(result.kind).toBe("done")
      if (result.kind !== "done") throw new Error("done")
      expect(result.row.kind).toBe("version")
      if (result.row.kind !== "version") throw new Error("row")
      expect(result.row.note).toBe(note)
    }
    const log = git(work, ["log", "--format=%s", "HEAD"]).trim().split("\n")
    expect(log.slice(0, 3)).toEqual(["Turn three", "Turn two", "Turn one"])
    await opened.close()
  })

  it("goes back to the first version and treats a second click as unchanged", async () => {
    const { work } = repo()
    const opened = await openProject(work, { token: "" }, { turnIdle: async () => undefined })
    if (opened.kind !== "open") throw new Error("open")
    writeFileSync(join(work, "index.html"), "<h1>One</h1>\n")
    opened.noteWrites(["index.html"])
    const first = await opened.agent.run({ kind: "save", note: toNote("Turn one") })
    writeFileSync(join(work, "index.html"), "<h1>Two</h1>\n")
    opened.noteWrites(["index.html"])
    await opened.agent.run({ kind: "save", note: toNote("Turn two") })
    if (first.kind !== "done" || first.row.kind !== "version") throw new Error("first")
    const back = await opened.human.run({ kind: "goBack", to: first.row.version })
    expect(back.kind).toBe("done")
    if (back.kind !== "done" || back.row.kind !== "version") throw new Error("back")
    expect(back.row.note).toBe("Turn one")
    expect(back.view.timeline[0]?.kind === "version" && back.view.timeline[0].note).toBe("Turn one")
    const again = await opened.human.run({ kind: "goBack", to: first.row.version })
    expect(again.kind).toBe("unchanged")
    const trees = git(work, ["log", "--format=%T", "HEAD"]).trim().split("\n")
    expect(trees[0]).toBe(trees[2])
    await opened.close()
  })

  it("returns a publish card and merges after confirm", async () => {
    const { work } = repo()
    const opened = await openProject(work, { token: "" }, { turnIdle: async () => undefined })
    if (opened.kind !== "open") throw newrW'&÷"‚&÷Vâ"¢w&—FTf–ÆU7–æ2†¦ö–â‡v÷&²Â&–æFW‚æ‡FÖÂ"’Â#Æƒå&VG“ÂöƒåÆâ"¢÷VæVBææ÷FUw&—FW2…²&–æFW‚æ‡FÖÂ%Ò¢v—B÷VæVBævVçBç'Vâ‡²¶–æC¢'6fR"Âæ÷FS¢Fôæ÷FR‚%&VG’"’Ò¢6öç7BV&Æ—6†VBÒv—B÷VæVBæ‡VÖâç'Vâ‡²¶–æC¢'V&Æ—6‚"Ò¢W‡V7B‡V&Æ—6†VBæ¶–æB’çFô&R‚&æVVG5–÷R"¢–b‡V&Æ—6†VBæ¶–æBÓÒ&æVVG5–÷R"ÇÂV&Æ—6†VBæÖ÷fRæ¶–æBÓÒ&6Æ–6²"’F‡&÷ræWrW'&÷"‚&6&B"¢W‡V7B‡V&Æ—6†VBæÖ÷fRæ6&Bæ¶–æB’çFô&R‚'V&Æ—6‚"¢6öç7Bw&çFVBÒv—B÷VæVBæ‡VÖâæ6öæf—&Ò‡V&Æ—6†VBæÖ÷fRæ6&Bæ–B¢W‡V7B…²&FöæR"Â'v—F–ær%Ò’çFô6öçF–â†w&çFVBæ¶–æB¢v—B÷VæVBæ6Æ÷6R‚¢Ò ¢—B‚'&WGW&ç2'W7’f÷"6V6öæB'Vâv†–ÆR6fR—2–âfÆ–v‡B"Â7–æ2‚’Óâ°¢6öç7B²v÷&²ÒÒ&Wò‚¢ÆWB&VÆV6RÒ‚’ÓâVæFVf–æV@¢6öç7B÷VæVBÒv—B÷Vå&ö¦V7B€¢v÷&²À¢²Fö¶Vã¢""ÒÀ¢°¢GW&ä–FÆS¢‚’Óà¢æWr&öÖ—6SÇfö–Câ‚‡&W6öÇfR’Óâ°¢&VÆV6RÒ&W6öÇfP¢Ò’À¢ÒÀ¢¢–b†÷VæVBæ¶–æBÓÒ&÷Vâ"’F‡&÷ræWrW'&÷"‚&÷Vâ"¢w&—FTf–ÆU7–æ2†¦ö–â‡v÷&²Â&–æFW‚æ‡FÖÂ"’Â#Æƒä'W7“ÂöƒåÆâ"¢÷VæVBææ÷FUw&—FW2…²&–æFW‚æ‡FÖÂ%Ò¢6öç7BVæF–ærÒ÷VæVBævVçBç'Vâ‡²¶–æC¢'6fR"Âæ÷FS¢Fôæ÷FR‚$–âfÆ–v‡B"’Ò¢6öç7B6V6öæBÒv—B÷VæVBævVçBç'Vâ‡²¶–æC¢'6fR"Âæ÷FS¢Fôæ÷FR‚%VWVVB"’Ò¢W‡V7B‡6V6öæBæ¶–æB’çFô&R‚&'W7’"¢&VÆV6R‚¢v—BVæF–æp¢v—B÷VæVBæ6Æ÷6R‚¢Ò ¢—B‚&f–æ—6†W2â–çFW''WFVBvò&6²öâ6WGFÆR–ç7FVBöbæWr6fR"Â7–æ2‚’Óâ°¢6öç7B²v÷&²ÒÒ&Wò‚¢6öç7B÷VæVBÒv—B÷Vå&ö¦V7B‡v÷&²Â²Fö¶Vã¢""ÒÂ²GW&ä–FÆS¢7–æ2‚’ÓâVæFVf–æVBÒ¢–b†÷VæVBæ¶–æBÓÒ&÷Vâ"’F‡&÷ræWrW'&÷"‚&÷Vâ"¢w&—FTf–ÆU7–æ2†¦ö–â‡v÷&²Â&–æFW‚æ‡FÖÂ"’Â#ÆƒäöæSÂöƒåÆâ"¢÷VæVBææ÷FUw&—FW2…²&–æFW‚æ‡FÖÂ%Ò¢6öç7Bf—'7BÒv—B÷VæVBævVçBç'Vâ‡²¶–æC¢'6fR"Âæ÷FS¢Fôæ÷FR‚%GW&âöæR"’Ò¢w&—FTf–ÆU7–æ2†¦ö–â‡v÷&²Â&–æFW‚æ‡FÖÂ"’Â#ÆƒåGvóÂöƒåÆâ"¢÷VæVBææ÷FUw&—FW2…²&–æFW‚æ‡FÖÂ%Ò¢v—B÷VæVBævVçBç'Vâ‡²¶–æC¢'6fR"Âæ÷FS¢Fôæ÷FR‚%GW&âGvò"’Ò¢–b†f—'7Bæ¶–æBÓÒ&FöæR"ÇÂf—'7Bç&÷ræ¶–æBÓÒ'fW'6–öâ"’F‡&÷ræWrW'&÷"‚&f—'7B"¢6öç7BF&vWBÒv—B‡v÷&²Â²'&Wb×'6R"Âf—'7Bç&÷rçfW'6–öåÒ’çG&–Ò‚¢v—B‡v÷&²Â²'&VB×G&VR"ÂG·F&vWGÕç·G&VWÖÒ¢v—B‡v÷&²Â²&6†V6¶÷WBÖ–æFW‚"Â"Ö"Â"Öb%Ò¢v—B÷VæVBæ6Æ÷6R‚¢6öç7B&V÷VæVBÒv—B÷Vå&ö¦V7B‡v÷&²Â²Fö¶Vã¢""ÒÂ²GW&ä–FÆS¢7–æ2‚’ÓâVæFVf–æVBÒ¢–b‡&V÷VæVBæ¶–æBÓÒ&÷Vâ"’F‡&÷ræWrW'&÷"‚'&V÷Vâ"¢6öç7Bf–WrÒv—B&V÷VæVBævVçBçf–Wr‚¢W‡V7B‡f–WrçF–ÖVÆ–æU³Óòæ¶–æBÓÓÒ'fW'6–öâ"bbf–WrçF–ÖVÆ–æU³Òææ÷FR’çFô&R‚%GW&âöæR"¢W‡V7B‡f–WrçF–ÖVÆ–æU³Óòæ¶–æBÓÓÒ'fW'6–öâ"bbf–WrçF–ÖVÆ–æU³Òæ6†ævRæ¶–æB’çFô&R‚'vVçD&6²"¢v—B&V÷VæVBæ6Æ÷6R‚¢fö–B5fW'6–öä–@¢Ò§Ò