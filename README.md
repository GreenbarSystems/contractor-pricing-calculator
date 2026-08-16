# Contractor Job Pricing Calculator

A plain-language calculator for small contractors and owner-operated trades businesses who want a clear answer to one question:

> What should I charge?

It helps turn labor pay, extra employer costs, material costs, other job costs, business operating costs, and a selected profit goal into a recommended job price.

## Product principle

The calculator should feel like a guided pricing conversation, not accounting software. It uses contractor-friendly labels such as **Labor pay**, **Extra cost on top of wages**, **Business costs for this job**, **Lowest price that covers these costs**, and **Recommended price to charge**.

Read [docs/customer-language.md](docs/customer-language.md) for the product vocabulary and [docs/calculation-rules.md](docs/calculation-rules.md) for formulas and assumptions.

## Current scope

This first implementation is a framework-independent TypeScript pricing engine. It includes:

- Regular and overtime labor pay
- Extra cost on top of wages
- Materials and other job costs
- Annual business-cost allocation by sellable customer-work hours
- Cost-recovery and recommended-price calculations
- Proposed-price profit, profit rate, markup, and status
- Input validation, warnings, and automated tests

The UI, persistence, PDF/Excel export, payments, CRM, invoicing, scheduling, accounting integrations, inventory, and project management are intentionally out of scope for this foundation.

## Architecture

```text
User input → validation → pricing engine → result object → UI
```

The calculation engine is independent of React and can later support the web calculator, a saved-jobs product, exports, APIs, and a Greenbar Web link or integration.

## Local development

Requirements: Node.js 20 or later.

```bash
npm install
npm run typecheck
npm test
```

## Important note

The calculator produces a pricing estimate from user-provided inputs. It does not replace a contractor's accounting records, tax adviser, accountant, or professional judgment.
