# Calculation rules

## Purpose

This engine estimates a price for one job. It is a pricing tool, not an accounting system and not a substitute for professional advice.

## Labor pay

Regular labor pay:

```text
hourly wage × number of workers × regular hours per worker
```

Overtime labor pay:

```text
hourly wage × number of workers × overtime hours per worker × overtime multiplier
```

Labor pay is the sum of regular and overtime labor pay.

## Extra cost on top of wages

```text
labor pay × extra wage cost rate
```

This rate is entered by the contractor. It can represent payroll taxes, workers' compensation, paid time off, benefits, and similar employer costs. The calculator does not claim that one percentage fits every contractor.

## Business costs for this job

```text
business cost per hour = annual business costs ÷ annual sellable hours
business costs for this job = business cost per hour × job hours
```

The engine uses calculated crew-hours from labor rows whenever they exist. If no labor hours exist, it can use manually entered job hours.

This is a pricing allocation, not a required accounting treatment.

## Total job cost

```text
labor pay
+ extra cost on top of wages
+ material cost
+ other job costs
+ business costs for this job
```

Other job costs can include permits, equipment rentals, subcontractors, delivery, disposal, and similar costs that are specific to the job.

## Price results

```text
lowest price that covers these costs = total job cost
recommended price to charge = total job cost ÷ (1 - profit you want to keep)
```

For example, a job with $6,310 of modeled costs and a 20% profit goal has a recommended price of $7,887.50.

```text
$6,310 ÷ (1 - 0.20) = $7,887.50
```

## Proposed price

```text
profit = quoted price - total job cost
profit you keep rate = profit ÷ quoted price
amount added above cost = profit ÷ total job cost
```

A quoted price is below cost if it is less than total job cost. It is below the goal if it covers total job cost but is below the recommended price.

## Deliberate V1 exclusions

The estimate is only as complete as its inputs. V1 does not automatically model sales tax, financing cost, retainage, warranty reserves, change-order risk, discounts, uncollectible amounts, inventory variance, or every trade-specific cost. Contractors should enter relevant items as other job costs or account for them in their selected profit goal.
