import { describe, expect, it } from "vitest";
import { validateJobPricingInput, type JobPricingInput } from "../../src/pricing/index.js";

const validInput: JobPricingInput = {
  jobName: "Panel upgrade",
  laborItems: [{ id: "tech", description: "Technician", hourlyWage: 45, workers: 1, regularHoursPerWorker: 8 }],
  extraWageCostRate: 0.25,
  materialItems: [{ id: "panel", description: "Panel", quantity: 1, unitCost: 250 }],
  businessCosts: { annualBusinessCosts: 30000, annualSellableHours: 1500 },
  targetProfitRate: 0.2,
};

describe("validateJobPricingInput", () => {
  it("accepts valid pricing input", () => {
    expect(validateJobPricingInput(validInput)).toEqual({ isValid: true, issues: [] });
  });

  it("requires a job name", () => {
    const result = validateJobPricingInput({ ...validInput, jobName: "  " });
    expect(result.isValid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ path: "jobName" }));
  });

  it("rejects negative values", () => {
    const result = validateJobPricingInput({
      ...validInput,
      extraWageCostRate: -0.1,
      laborItems: [{ ...validInput.laborItems[0], hourlyWage: -45 }],
      materialItems: [{ ...validInput.materialItems[0], unitCost: -1 }],
    });

    expect(result.isValid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["extraWageCostRate", "laborItems.0.hourlyWage", "materialItems.0.unitCost"]),
    );
  });

  it("rejects a profit target below zero or at 100% and above", () => {
    expect(validateJobPricingInput({ ...validInput, targetProfitRate: -0.01 }).isValid).toBe(false);
    expect(validateJobPricingInput({ ...validInput, targetProfitRate: 1 }).isValid).toBe(false);
    expect(validateJobPricingInput({ ...validInput, targetProfitRate: 1.1 }).isValid).toBe(false);
  });

  it("requires sellable hours when annual business costs are entered", () => {
    const result = validateJobPricingInput({
      ...validInput,
      businessCosts: { annualBusinessCosts: 10000, annualSellableHours: 0 },
    });

    expect(result.isValid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ path: "businessCosts.annualSellableHours" }));
  });

  it("rejects invalid numeric values", () => {
    const result = validateJobPricingInput({ ...validInput, proposedPrice: Number.NaN });
    expect(result.isValid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ path: "proposedPrice" }));
  });
});
