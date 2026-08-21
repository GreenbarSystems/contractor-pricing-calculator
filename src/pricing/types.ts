export type Money = number;
export type Rate = number;

export interface LaborItemInput {
  id: string;
  description: string;
  hourlyWage: Money;
  workers: number;
  regularHoursPerWorker: number;
  overtimeHoursPerWorker?: number;
  overtimeMultiplier?: number;
}

export interface MaterialItemInput {
  id: string;
  description: string;
  quantity: number;
  unitCost: Money;
}

export type OtherJobCostCategory =
  | "subcontractor"
  | "equipment"
  | "permit"
  | "delivery"
  | "disposal"
  | "other";

export interface OtherJobCostItemInput {
  id: string;
  description: string;
  amount: Money;
  category: OtherJobCostCategory;
}

export interface BusinessCostsInput {
  annualBusinessCosts: Money;
  annualSellableHours: number;
}

export interface JobPricingInput {
  jobName: string;
  jobReference?: string;
  notes?: string;
  laborItems: LaborItemInput[];
  extraWageCostRate: Rate;
  materialItems: MaterialItemInput[];
  otherJobCostItems?: OtherJobCostItemInput[];
  businessCosts?: BusinessCostsInput;
  manualJobHours?: number;
  targetProfitRate: Rate;
  proposedPrice?: Money;
}

export type CalculationWarningCode =
  | "NO_LABOR_HOURS"
  | "BUSINESS_COSTS_NOT_INCLUDED"
  | "MANUAL_HOURS_USED"
  | "PRICE_BELOW_COST"
  | "PRICE_BELOW_TARGET"
  | "NO_PROPOSED_PRICE";

export interface CalculationWarning {
  code: CalculationWarningCode;
  message: string;
}

export type ProposedPriceStatus = "below-cost" | "below-target" | "meets-target" | "not-entered";

export interface JobPricingResult {
  laborHours: number;
  regularLaborPay: Money;
  overtimeLaborPay: Money;
  laborPay: Money;
  extraWageCosts: Money;
  totalLaborCost: Money;
  materialCost: Money;
  otherJobCosts: Money;
  annualBusinessCosts: Money;
  annualSellableHours: number;
  businessCostPerHour: Money;
  businessCostsForJob: Money;
  totalJobCost: Money;
  costRecoveryPrice: Money;
  targetProfitRate: Rate;
  recommendedPrice: Money;
  targetProfit: Money;
  targetMarkup: Rate;
  proposedPrice?: Money;
  proposedProfit?: Money;
  proposedProfitRate?: Rate;
  proposedMarkup?: Rate;
  proposedPriceStatus: ProposedPriceStatus;
  warnings: CalculationWarning[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
}
