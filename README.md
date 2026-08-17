# Contractor Job Pricing Calculator

A plain-language calculator for small contractors and owner-operated trades businesses who want a clear answer to one question:

> What should I charge?

It helps turn labor pay, extra employer costs, material costs, other job costs, business operating costs, and a selected profit goal into a recommended job price.

## Product principle

The calculator should feel like a guided pricing conversation, not accounting software. It uses contractor-friendly labels such as **Labor pay**, **Extra cost on top of wages**, **Business costs for this job**, **Lowest price that covers these costs**, and **Recommended price to charge**.

Read [docs/customer-language.md](docs/customer-language.md) for the product vocabulary and [docs/calculation-rules.md](docs/calculation-rules.md) for formulas and assumptions.

## Current scope

A browser calculator (Next.js App Router + React) sitting on top of a framework-independent TypeScript pricing engine.

The page asks for a job in five plain-language steps — about this job, your crew, what you will buy or pay for, costs of running your business, and your profit goal — and answers with a recommended price, the lowest price that covers costs, the profit you keep, a cost breakdown, and a $500-either-side scenario table. Work in progress is kept in the browser's local storage, so nothing is sent anywhere and no account is needed.

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

Then open http://localhost:3000.

```bash
npm run typecheck
npm test
npm run build
```

## Important note

The calculator produces a pricing estimate from user-provided inputs. It does not replace a contractor's accounting records, tax adviser, accountant, or professional judgment.
