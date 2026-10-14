import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { tryLock, unlock } from "./state.js"

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("tryLock", () => {
  it("returns locked when this process already holds the lock", () => {
    const work = mkdtempSync(join(tmpdir(), "plane-lock-"))
    dirs.push(work)
    expect(tryLock(work, process.pid)).toBe("held")
    expect(tryLock(work, process.pid)).toBe("locked")
    unlock(work)
  })
})
