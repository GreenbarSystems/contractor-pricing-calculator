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
    const first = await runPrompt("Turn one");
    expect(first.view.timeline[0]?.kind === "version" && first.view.timeline[0].note).toBe("Turn one");
    expect(readFileSync(join(work, "turns/latest.md"), "utf8")).toContain)à‰QÕÉ¸½¹”ˆ¤ì(€€€½¹ÍĞÍ•½¹€ô…İ…¥ĞÉÕ¹AÉ½µÁĞ ‰QÕÉ¸Ñİ¼ˆ¤ì(€€€•áÁ•Ğ¡Í•½¹¹Ù¥•Ü¹Ñ¥µ•±¥¹•lÁtü¹­¥¹€ôôô€‰Ù•ÉÍ¥½¸ˆ€˜˜Í•½¹¹Ù¥•Ü¹Ñ¥µ•±¥¹•lÁt¹¹½Ñ”¤¹Ñ½	” ‰QÕÉ¸Ñİ¼ˆ¤ì(€€€½¹ÍĞ™¥ÉÍÑ%€ô™¥ÉÍĞ¹Ù¥•Ü¹Ñ¥µ•±¥¹•lÁtü¹­¥¹€ôôô€‰Ù•ÉÍ¥½¸ˆ€ü™¥ÉÍĞ¹Ù¥•Ü¹Ñ¥µ•±¥¹•lÁt¹Ù•ÉÍ¥½¸€è€ˆˆì(€€€½¹ÍĞÉ•ÍÑ½É•€ô…İ…¥ĞÉÕ¹I•ÍÑ½É”¡™¥ÉÍÑ%¤ì(€€€•áÁ•Ğ¡É•ÍÑ½É•¹É•ÍÕ±Ğ¹­¥¹¤¹Ñ½	” ‰‘½¹”ˆ¤ì(€€€•áÁ•Ğ¡É•ÍÑ½É•¹Ù¥•Ü¹Ñ¥µ•±¥¹•lÁtü¹­¥¹€ôôô€‰Ù•ÉÍ¥½¸ˆ€˜˜É•ÍÑ½É•¹Ù¥•Ü¹Ñ¥µ•±¥¹•lÁt¹¹½Ñ”¤¹Ñ½	” ‰QÕÉ¸½¹”ˆ¤ì(€€€•áÁ•Ğ¡É•…‘¥±•Må¹Œ¡©½¥¸¡İ½É¬°€‰ÑÕÉ¹Ì½±…Ñ•ÍĞ¹µˆ¤°€‰ÕÑ˜àˆ¤¤¹Ñ½½¹Ñ…¥¸ ‰QÕÉ¸½¹”ˆ¤ì(€ô¤ì((€¥Ğ ‰É•ÑÕÉ¹Ì„ÁÕ‰±¥Í …É¥¹ÍÑ•…½˜µ•É¥¹œ½¸ÉÕ¸ˆ°…Íå¹Œ€ ¤€ôøì(€€€½¹ÍĞİ½É¬€ô±¥¹­•‘I•Á¼ ¤ì(€€€½¹ÍĞ½Á•¹•€ô…İ…¥Ğ‰½½ÑA±…¹”¡İ½É¬°€ˆˆ¤ì(€€€•áÁ•Ğ¡½Á•¹•¹­¥¹¤¹Ñ½	” ‰É•…‘äˆ¤ì(€€€…İ…¥ĞÉÕ¹AÉ½µÁĞ ‰I•…‘äˆ¤ì(€€€½¹ÍĞÁÕ‰±¥Í¡•€ô…İ…¥ĞÉÕ¹AÕ‰±¥Í  ¤ì(€€€•áÁ•Ğ¡ÁÕ‰±¥Í¡•¹É•ÍÕ±Ğ¹­¥¹¤¹Ñ½	” ‰¹••‘Íe½Ôˆ¤ì(€€€¥˜€¡ÁÕ‰±¥Í¡•¹É•ÍÕ±Ğ¹­¥¹€„ôô€‰¹••‘Íe½Ôˆ¤Ñ¡É½Ü¹•ÜÉÉ½È ‰…Éˆ¤ì(€€€•áÁ•Ğ¡ÁÕ‰±¥Í¡•¹É•ÍÕ±Ğ¹µ½Ù”¹­¥¹¤¹Ñ½	” ‰±¥¬ˆ¤ì(€ô¤ì)ô¤ì(