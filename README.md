# Contractor Job Pricing Calculator

A plain-language calculator for small contractors and owner-operated trades businesses who want a clear answer to one question:

> What should I charge?

It helps turn labor pay, extra employer costs, material costs, other job costs, business operating costs, and a selected profit goal into a recommended job price.

## Product principle

The calculator should feel like a guided pricing conversation, not accounting software. It uses contractor-friendly labels such as **Labor pay**, **Extra cost on top of wages**, **Business costs for this job**, **Lowest price that covers these costs**, and **Recommended price to charge**.

Read [docs/customer-language.md](docs/customer-language.md) for the product vocabulary and [docs/calculation-rules.md](docs/calculation-rules.md) for formulas and assumptions.

## Current scope

A browser calculator (Next.js App Router + React) sitting on top of a framework-independent TypeScript pricing engine.

The page asks three plain-language steps — your crew, what you will buy or pay for, and your profit goal — and answers with a recommended price, the lowest price that covers costs, the profit you keep, a cost breakdown, and a $500-either-side scenario table. Work in progress is kept in the browser's local storage, so nothing is sent anywhere and no account is needed.

Nothing is required to get a price. Naming the job is optional, blank numbers count as zero, and business costs sit behind an optional opener rather than in the main flow, because most contractors have never worked out what a year of running their business costs and should not have to before they can price a job. The engine's own warning tells them what the price does not yet cover.

The engine underneath includes:

- Regular and overtime labor pay
- Extra cost on top of wages
- Materials and other job costs
- Annual business-cost allocation by sellable customer-work hours
- Cost-recovery and recommended-price calculations
- Proposed-price profit, profit rate, markup, and status
- Input validation, warnings, and automated tests

Accounts, databases, PDF/Excel export, payments, CRM, invoicing, scheduling, accounting integrations, inventory, and project management are intentionally out of scope.

## Architecture

```text
User input → validation → pricing engine → result object → UI
```

The calculation engine is independent of React and can later support the web calculator, a saved-jobs product, exports, APIs, and a Greenbar Web link or integration.

## Local development

Requirements: Node.js 20 or later.

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:43179. The first screen is the thread, the calculator preview, and the version list. Send a prompt. A version appears. Undo goes back. Publish shows a card. There is no Save button.

`npm run dev` starts the Next app on 43179 and the control-plane host on 43188. `openProject` uses this repo's git workspace. An empty `GITHUB_TOKEN` mocks GitHub REST. Set `GITHUB_TOKEN` to push and open pull requests on github.com.

```bash
npm run typecheck
npm test
npm run verify
npm run build
```

The control plane lives in `packages/control-plane`. Host wiring is `host/session.ts`. Checkpoint restore from the host is `goBack` (`host/intents.ts`). File writes go through `noteWrites`. The assistant saves at the end of a turn that changed files, and again when the process exits.

## Important note

The calculator produces a pricing estimate from user-provided inputs. It does not replace a contractor's accounting records, tax adviser, accountant, or professional judgment.
