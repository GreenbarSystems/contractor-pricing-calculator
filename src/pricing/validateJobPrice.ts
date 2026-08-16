import type { JobPricingInput, ValidationIssue, ValidationResult } from "./types.js";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const addNonNegativeIssue = (issues: ValidationIssue[], path: string, value: unknown, label: string): void => {
  if (!isFiniteNumber(value) || value < 0) {
    issues.push({ path, message: `${label} must be a number that is zero or greater.` });
  }
};

const addPositiveIssue = (issues: ValidationIssue[], path: string, value: unknown, label: string): void => {
  if (!isFiniteNumber(value) || value <= 0) {
    issues.push({ path, message: `${label} must be greater than zero.` });
  }
};

export function validateJobPricingInput(input: JobPricingInput): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!input.jobName?.trim()) {
    issues.push({ path: "jobName", message: "Enter a name for this job." });
  }

  addNonNegativeIssue(issues, "extraWageCostRate", input.extraWageCostRate, "Extra cost on top of wages");

  if (!isFiniteNumber(input.targetProfitRate) || input.targetProfitRate < 0 || input.targetProfitRate >= 1) {
    issues.push({
      path: "targetProfitRate",
      message: "Profit you want to keep must be at least 0% and less than 100%.",
    });
  }

  if (input.proposedPrice !== undefined) {
    addNonNegativeIssue(issues, "proposedPrice", input.proposedPrice, "Your quoted price");
  }

  input.laborItems.forEach((item, index) => {
    const prefix = `laborItems.${index}`;
    addNonNegativeIssue(issues, `${prefix}.hourlyWage`, item.hourlyWage, "Hourly wage");
    addNonNegativeIssue(issues, `${prefix}.workers`, item.workers, "Number of workers");
    addNonNegativeIssue(issues, `${prefix}.regularHoursPerWorker`, item.regularHoursPerWorker, "Regular hours");
    addNonNegativeIssue(issues, `${prefix}.overtimeHoursPerWorker`, item.overtimeHoursPerWorker ?? 0, "Overtime hours");
    addPositiveIssue(issues, `${prefix}.overtimeMultiplier`, item.overtimeMultiplier ?? 1.5, "Overtime multiplier");
  });

  input.materialItems.forEach((item, index) => {
    const prefix = `materialItems.${index}`;
    addNonNegativeIssue(issues, `${prefix}.quantity`, item.quantity, "Material quantity");
    addNonNegativeIssue(issues, `${prefix}.unitCost`, item.unitCost, "Material cost");
  });

  input.otherJobCostItems?.forEach((item, index) => {
    addNonNegativeIssue(issues, `otherJobCostItems.${index}.amount`, item.amount, "Other job cost");
  });

  if (input.manualJobHours !== undefined) {
    addNonNegativeIssue(issues, "manualJobHours", input.manualJobHours, "Job hours");
  }

  if (input.businessCosts) {
    addNonNegativeIssue(issues, "businessCosts.annualBusinessCosts", input.businessCosts.annualBusinessCosts, "Annual business costs");

    if (input.businessCosts.annualBusinessCosts > 0) {
      addPositiveIssue(
        issues,
        "businessCosts.annualSellableHours",
        input.businessCosts.annualSellableHours,
        "Hours you expect to sell this year",
      );
    } else {
      addNonNegativeIssue(
        issues,
        "businessCosts.annualSellableHours",
        input.businessCosts.annualSellableHours,
        "Hours you expect to sell this year",
      );
    }
  }

  return { isValid: issues.length === 0, issues };
}
