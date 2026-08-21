import type { CalculationWarning, JobPricingInput, JobPricingResult, ProposedPriceStatus } from "./types.js";
import { validateJobPricingInput } from "./validateJobPrice.js";

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

export function calculateJobPrice(input: JobPricingInput): JobPricingResult {
  const validation = validateJobPricingInput(input);
  if (!validation.isValid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  const laborHours = sum(
    input.laborItems.map((item) => item.workers * (item.regularHoursPerWorker + (item.overtimeHoursPerWorker ?? 0))),
  );

  const regularLaborPay = sum(
    input.laborItems.map((item) => item.hourlyWage * item.workers * item.regularHoursPerWorker),
  );

  const overtimeLaborPay = sum(
    input.laborItems.map(
      (item) =>
        item.hourlyWage *
        item.workers *
        (item.overtimeHoursPerWorker ?? 0) *
        (item.overtimeMultiplier ?? 1.5),
    ),
  );

  const laborPay = regularLaborPay + overtimeLaborPay;
  const extraWageCosts = laborPay * input.extraWageCostRate;
  const totalLaborCost = laborPay + extraWageCosts;
  const materialCost = sum(input.materialItems.map((item) => item.quantity * item.unitCost));
  const otherJobCosts = sum((input.otherJobCostItems ?? []).map((item) => item.amount));

  const annualBusinessCosts = input.businessCosts?.annualBusinessCosts ?? 0;
  const annualSellableHours = input.businessCosts?.annualSellableHours ?? 0;
  const businessCostPerHour = annualBusinessCosts > 0 ? annualBusinessCosts / annualSellableHours : 0;
  const jobHoursForBusinessCosts = laborHours > 0 ? laborHours : (input.manualJobHours ?? 0);
  const businessCostsForJob = businessCostPerHour * jobHoursForBusinessCosts;

  const totalJobCost = totalLaborCost + materialCost + otherJobCosts + businessCostsForJob;
  const costRecoveryPrice = totalJobCost;
  const recommendedPrice = totalJobCost / (1 - input.targetProfitRate);
  const targetProfit = recommendedPrice - totalJobCost;
  const targetMarkup = totalJobCost === 0 ? 0 : targetProfit / totalJobCost;

  let proposedProfit: number | undefined;
  let proposedProfitRate: number | undefined;
  let proposedMarkup: number | undefined;
  let proposedPriceStatus: ProposedPriceStatus = "not-entered";

  if (input.proposedPrice !== undefined) {
    proposedProfit = input.proposedPrice - totalJobCost;
    proposedProfitRate = input.proposedPrice === 0 ? 0 : proposedProfit / input.proposedPrice;
    proposedMarkup = totalJobCost === 0 ? 0 : proposedProfit / totalJobCost;
    proposedPriceStatus =
      input.proposedPrice < costRecoveryPrice
        ? "below-cost"
        : input.proposedPrice < recommendedPrice
          ? "below-target"
          : "meets-target";
  }

  const warnings: CalculationWarning[] = [];
  if (laborHours === 0) {
    warnings.push({
      code: "NO_LABOR_HOURS",
      message: "No crew hours were entered. Add labor or enter job hours before relying on business costs for this job.",
    });
  }
  if (annualBusinessCosts === 0) {
    warnings.push({
      code: "BUSINESS_COSTS_NOT_INCLUDED",
      message: "Business costs are not included. Add them if you want this price to help cover trucks, insurance, software, office costs, and other operating costs.",
    });
  }
  if (laborHours === 0 && (input.manualJobHours ?? 0) > 0) {
    warnings.push({
      code: "MANUAL_HOURS_USED",
      message: "Business costs for this job use the job hours you entered manually.",
    });
  }
  if (proposedPriceStatus === "below-cost") {
    warnings.push({ code: "PRICE_BELOW_COST", message: "Your quoted price does not cover the costs you entered." });
  }
  if (proposedPriceStatus === "below-target") {
    warnings.push({ code: "PRICE_BELOW_TARGET", message: "Your quoted price covers costs but misses your profit goal." });
  }
  if (proposedPriceStatus === "not-entered") {
    warnings.push({ code: "NO_PROPOSED_PRICE", message: "Enter a quoted price to compare it with your recommended price." });
  }

  return {
    laborHours,
    regularLaborPay,
    overtimeLaborPay,
    laborPay,
    extraWageCosts,
    totalLaborCost,
    materialCost,
    otherJobCosts,
    annualBusinessCosts,
    annualSellableHours,
    businessCostPerHour,
    businessCostsForJob,
    totalJobCost,
    costRecoveryPrice,
    targetProfitRate: input.targetProfitRate,
    recommendedPrice,
    targetProfit,
    targetMarkup,
    proposedPrice: input.proposedPrice,
    proposedProfit,
    proposedProfitRate,
    proposedMarkup,
    proposedPriceStatus,
    warnings,
  };
}
