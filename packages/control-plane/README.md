# Control plane

A TypeScript package for Save, Restore, and Share inside an agent coding loop. GitHub keeps every version as a commit. Publish opens and merges a pull request. The panel chrome is **Your draft** and **Live**. There is no Save button. Publish is a card. The model cannot confirm or answer.

This is the first slice. `askForReview` is in the types and returns `notInThisSlice`. Live GitHub end-to-end checks are skipped unless `GITHUB_TOKEN` is set. With no token, GitHub REST is mocked and pushes go to a local git remote.

## Who it is for

A beginner who can describe an app and click a preview. They get undo that is larger than editor undo, and a copy that lives on GitHub.

A host engineer imports `openProject`, `agentTools`, and `toNote`. Callers never import Git object names.

## Run locally

```bash
npm install
npm run verify
npm run dev
```

`npm run verify` runs unit tests against recorded GitHub JSON and a local git remote, compiles the public entry, and runs `scripts/check-surface.ts`. That script fails if the public package exports `Commit`, `Ref`, `Remote`, or `Sha`, or if the model tool schema includes `confirm` or `answer`.

`npm run dev` starts the demo on [http://127.0.0.1:43177](http://127.0.0.1:43177). The first screen is the thread, the preview, and the version list. Send a prompt. A version appears. Undo goes back. Publish shows a card.

Host wiring in your own product:

```ts
import { openProject, agentTools, toNote } from "control-plane"

const opened = await openProject(workspaceDir, { token: process.env.GITHUB_TOKEN ?? "" }, {
  turnIdle: () => loop.whenIdleAfterSave(),
})
if (opened.kind !== "open") return
model.registerTools(agentTools(opened.agent))
opened.human.subscribe((view) => panel.render(view))
loop.onFileWrite((paths) => opened.noteWrites(paths))
```

## What this slice leaves out

- `askForReview` with a reviewer picker
- Live GitHub crash tests against github.com when no token is present
- Rebase, stash, cherry-pick, Actions setup, forks, a commit graph, and a branch switcher
