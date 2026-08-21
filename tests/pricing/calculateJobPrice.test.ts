import { describe, expect, it } from "vitest";
import { calculateJobPrice, type JobPricingInput } from "../../src/pricing/index.js";

const baseInput: JobPricingInput = {
  jobName: "Kitchen remodel - Smith",
  laborItems: [
    {
      id: "carpenter",
      description: "Carpenter",
      hourlyWage: 25,
      workers: 2,
      regularHoursPerWorker: 40,
    },
  ],
  extraWageCostRate: 0.28,
  materialItems: [{ id: "lumber", description: "Lumber", quantity: 1, unitCost: 2000 }],
  otherJobCostItems: [{ id: "permit", description: "Permit", amount: 250, category: "permit" }],
  businessCosts: { annualBusinessCosts: 75000, annualSellableHours: 4000 },
  targetProfitRate: 0.2,
};

describe("calculateJobPrice", () => {
  it("calculates a clear recommended price from real job costs", () => {
    const result = calculateJobPrice(baseInput);

    expect(result.laborHours).toBe(80);
    expect(result.regularLaborPay).toBe(2000);
    expect(result.overtimeLaborPay).toBe(0);
    expect(result.extraWageCosts).toBe(560);
    expect(result.totalLaborCost).toBe(2560);
    expect(result.materialCost).toBe(2000);
    expect(result.otherJobCosts).toBe(250);
    expect(result.businessCostPerHour).toBe(18.75);
    expect(result.businessCostsForJob).toBe(1500);
    expect(result.totalJobCost).toBe(6310);
    expect(result.costRecoveryPrice).toBe(6310);
    expect(result.recommendedPrice).toBe(7887.5);
    expect(result.targetProfit).toBe(1577.5);
    expect(result.targetMarkup).toBeCloseTo(0.25, 12);
  });

  it("includes overtime pay and overtime crew hours", () => {
    const result = calculateJobPrice({
      ...baseInput,
      laborItems: [
        {
          id: "electrician",
          description: "Electrician",
          hourlyWage: 30,
          workers: 2,
          regularHoursPerWorker: 10,
          overtimeHoursPerWorker: 5,
          overtimeMultiplier: 1.5,
        },
      ],
    });

    expect(result.laborHours).toBe(30);
    expect(result.regularLaborPay).toBe(600);
    expect(result.overtimeLaborPay).toBe(450);
    expect(result.laborPay).toBe(1050);
  });

  it("uses multiple labor rows", () => {
    const result = calculateJobPrice({
      ...baseInput,
      laborItems: [
        { id: "lead", description: "Lead", hourlyWage: 35, workers: 1, regularHoursPerWorker: 10 },
        { id: "helper", description: "Helper", hourlyWage: 20, workers: 2, regularHoursPerWorker: 10 },
      ],
    });

    expect(result.laborHours).toBe(30);
    expect(result.regularLaborPay).toBe(750);
  });

  it("uses manually entered job hours when no labor hours exist", () => {
    const result = calculateJobPrice({
      ...baseInput,
      laborItems: [],
      manualJobHours: 10,
    });

    expect(result.laborHours).toBe(0);
    expect(result.businessCostsForJob).toBe(187.5);
    expect(result.warnings.map((warning) => warning.code)).toContain("MANUAL_HOURS_USED");
  });

  it("supports a zero-profit target", () => {
    const result = calculateJobPrice({ ...baseInput, targetProfitRate: 0 });

    expect(result.recommendedPrice).toBe(result.totalJobCost);
    expect(result.targetProfit).toBe(0);
  });

  it("shows a proposed price below cost", () => {
    const result = calculateJobPrice({ ...baseInput, proposedPrice: 6000 });

    expect(result.proposedPriceStatus).toBe("below-cost");
    expect(result.proposedProfit).toBe(-310);
    expect(result.proposedProfitRate).toBeCloseTo(-310 / 6000, 12);
  });

  it("shows a proposed price that covers costs but misses the goal", () => {
    const result = calculateJobPrice({ ...baseInput, proposedPrice: 7000 });

    expect(result.proposedPriceStatus).toBe("below-target");
    expect(result.proposedProfit).toBe(690);
  });

  it("shows a proposed price that meets the goal", () => {
    const result = calculateJobPrice({ ...baseInput, proposedPrice: 8000 });

    expect(result.proposedPriceStatus).toBe("meets-target");
    expect(result.proposedProfit).toBe(1690);
    expect(result.proposedProfitRate).toBeCloseTo(0.21125, 12);
    expect(result.proposedMarkup).toBeCloseTo(1690 / 6310, 12);
  });

  it("does not produce NaN when all modeled costs are zero", () => {
    const result = calculateJobPrice({
      jobName: "No-cost sample",
      laborItems: [],
      extraWageCostRate: 0,
      materialItems: [],
      targetProfitRate: 0,
      proposedPrice: 0,
    });

    expect(result.totalJobCost).toBe(0);
    expect(result.recommendedPrice).toBe(0);
    expect(result.proposedProfitRate).toBe(0);
    expect(result.proposedMarkup).toBe(0);
  });

  it("keeps full precision in the engine", () => {
    const result = calculateJobPrice({
      ...baseInput,
      laborItems: [{ id: "precision", description: "Precision work", hourlyWage: 22.37, workers: 1, regularHoursPerWorker: 3.25 }],
      materialItems: [],
      otherJobCostItems: [],
      businessCosts: undefined,
      extraWageCostRate: 0.271,
      targetProfitRate: 0.173,
    });

    // labor pay 22.37 x 1 x 3.25 = 72.7025
    // extra cost on top of wages 72.7025 x 0.271 = 19.7023775
    expect(result.laborPay).toBeCloseTo(72.7025, 12);
    expect(result.extraWageCosts).toBeCloseTo(19.7023775, 12);
    expect(result.totalJobCost).toBeCloseTo(92.4048775, 12);
    expect(result.recommendedPrice).toBeCloseTo(111.73503929866989, 12);
  });
});
