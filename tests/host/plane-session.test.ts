import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bootPlane, closePlane, runPrompt, runPublish, runRestore } from "../../host/session.js";

const dirs: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "You",
      GIT_AUTHOR_EMAIL: "you@local",
      GIT_COMMITTER_NAME: "You",
      GIT_COMMITTER_EMAIL: "you@local",
    },
  });
}

function linkedRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "host-plane-"));
  dirs.push(root);
  const bare = join(root, "origin.git");
  const work = join(root, "work");
  execFileSync("git", ["init", "--bare", bare], { encoding: "utf8" });
  mkdirSync(work);
  git(work, ["init"]);
  git(work, ["checkout", "-b", "main"]);
  git(work, ["config", "user.name", "You"]);
  git(work, ["config", "user.email", "you@local"]);
  writeFileSync(join(work, "index.html"), "<h1>Live</h1>\n");
  git(work, ["add", "index.html"]);
  git(work, ["commit", "-m", "live"]);
  git(work, ["remote", "add", "origin", bare]);
  git(work, ["push", "-u", "origin", "main"]);
  return work;
}

afterEach(async () => {
  await closePlane();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("host plane session", () => {
  it("saves a prompt as a version and restores through goBack", async () => {
    const work = linkedRepo();
    const opened = await bootPlane(work, "");
    expect(opened.kind).toBe("ready");
    const first = await runPrompt("Turn one", { jobName: "Kitchen remodel", hourlyWage: "50" });
    expect(first.view.timeline[0]?.kind === "version" && first.view.timeline[0].note).toBe("Turn one");
    expect(readFileSync(join(work, "turns/latest.md"), "utf8")).toContain("Turn one");
    expect(readFileSync(join(work, "turns/job.json"), "utf8")).toContain("Kitchen remodel");
    expect(first.preview).toMatchObject({ jobName: "Kitchen remodel" });
    const second = await runPrompt("Turn two", { jobName: "Deck" });
    expect(second.view.timeline[0]?.kind === "version" && second.view.timeline[0].note).toBe("Turn two");
    expect(readFileSync(join(work, "turns/job.json"), "utf8")).toContain("Deck");
    const firstId = first.view.timeline[0]?.kind === "version" ? first.view.timeline[0].version : "";
    const restored = await runRestore(firstId);
    expect(restored.result.kind).toBe("done");
    expect(restored.view.timeline[0]?.kind === "version" && restored.view.timeline[0].note).toBe("Turn one");
    expect(readFileSync(join(work, "turns/latest.md"), "utf8")).toContain("Turn one");
    expect(restored.preview).toMatchObject({ jobName: "Kitchen remodel" });
  });

  it("returns a publish card instead of merging on run", async () => {
    const work = linkedRepo();
    const opened = await bootPlane(work, "");
    expect(opened.kind).toBe("ready");
    await runPrompt("Ready");
    const published = await runPublish();
    expect(published.result.kind).toBe("needsYou");
    if (published.result.kind !== "needsYou") throw new Error("card");
    expect(published.result.move.kind).toBe("click");
  });
});
