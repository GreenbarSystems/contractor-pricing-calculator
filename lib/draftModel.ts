import {
  createMaterialRow,
  reviveDraft,
  type CalculatorDraft,
  type MaterialRowDraft,
  type OtherCostRowDraft,
} from "./calculatorState.js";

/**
 * The paid object later is a saved business profile. Crew rates, extra-wage %,
 * and shop-cost inputs live here so starting over a job cannot wipe them.
 *
 * Label is a string the contractor types. This is not a rate library: no roles,
 * effective dates, or union scale.
 */
export interface CrewRate {
  id: string;
  hourlyWage: string;
  label: string;
}

export interface BusinessProfile {
  annualBusinessCosts: string;
  annualSellableHours: string;
  extraWageCostPercent: string;
  crewRates: CrewRate[];
}

/**
 * One job's numbers. Wages stay on the profile; the row only points at a rate.
 */
export interface JobLaborRowDraft {
  id: string;
  rateId: string;
  workers: string;
  regularHours: string;
  overtimeHours: string;
  overtimeMultiplier: string;
}

export interface JobDraft {
  jobName: string;
  laborRows: JobLaborRowDraft[];
  materialRows: MaterialRowDraft[];
  otherCostRows: OtherCostRowDraft[];
  manualJobHours: string;
  targetProfitPercent: string;
  proposedPrice: string;
}

export const DEFAULT_EXTRA_WAGE_COST_PERCENT = "28";

let rowCounter = 0;

function createRowId(prefix: string): string {
  rowCounter += 1;
  return `${prefix}-${rowCounter}`;
}

export function createCrewRate(): CrewRate {
  return { id: createRowId("rate"), hourlyWage: "", label: "" };
}

export function createJobLaborRow(rateId = ""): JobLaborRowDraft {
  return {
    id: createRowId("crew"),
    rateId,
    workers: "1",
    regularHours: "",
    overtimeHours: "",
    overtimeMultiplier: "1.5",
  };
}

export function createEmptyBusinessProfile(): BusinessProfile {
  return {
    annualBusinessCosts: "",
    annualSellableHours: "",
    extraWageCostPercent: DEFAULT_EXTRA_WAGE_COST_PERCENT,
    crewRates: [createCrewRate()],
  };
}

export function createEmptyJobDraft(): JobDraft {
  return {
    jobName: "",
    laborRows: [createJobLaborRow()],
    materialRows: [createMaterialRow()],
    otherCostRows: [],
    manualJobHours: "",
    targetProfitPercent: "20",
    proposedPrice: "",
  };
}

const text = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

function reviveRows<T extends { id: string }>(
  value: unknown,
  idPrefix: string,
  defaults: Omit<T, "id">,
  fallback: T[],
): T[] {
  if (!Array.isArray(value)) return fallback;

  const rows = value.map((row) => {
    const source = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;
    const revived: Record<string, unknown> = { id: text(source.id, createRowId(idPrefix)) };
    for (const [field, fallbackValue] of Object.entries(defaults)) {
      revived[field] = text(source[field], fallbackValue as string);
    }
    return revived as T;
  });

  return rows.length > 0 ? rows : fallback;
}

/** Stored profiles are re-checked against the current shape instead of being trusted. */
export function reviveBusinessProfile(value: unknown): BusinessProfile | null {
  if (typeof value !== "object" || value === null) return null;
  const stored = value as Partial<Record<keyof BusinessProfile, unknown>>;
  const fallback = createEmptyBusinessProfile();

  return {
    annualBusinessCosts: text(stored.annualBusinessCosts, ""),
    annualSellableHours: text(stored.annualSellableHours, ""),
    extraWageCostPercent: text(stored.extraWageCostPercent, fallback.extraWageCostPercent),
    crewRates: reviveRows<CrewRate>(
      stored.crewRates,
      "rate",
      { hourlyWage: "", label: "" },
      fallback.crewRates,
    ),
  };
}

export function reviveJobDraft(value: unknown): JobDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const stored = value as Partial<Record<keyof JobDraft, unknown>>;
  const fallback = createEmptyJobDraft();

  return {
    jobName: text(stored.jobName, ""),
    laborRows: reviveRows<JobLaborRowDraft>(
      stored.laborRows,
      "crew",
      {
        rateId: "",
        workers: "1",
        regularHours: "",
        overtimeHours: "",
        overtimeMultiplier: "1.5",
      },
      fallback.laborRows,
    ),
    materialRows: reviveRows<MaterialRowDraft>(
      stored.materialRows,
      "material",
      { quantity: "1", unitCost: "" },
      fallback.materialRows,
    ),
    otherCostRows: reviveRows<OtherCostRowDraft>(
      stored.otherCostRows,
      "other",
      { description: "", amount: "" },
      fallback.otherCostRows,
    ),
    manualJobHours: text(stored.manualJobHours, ""),
    targetProfitPercent: text(stored.targetProfitPercent, fallback.targetProfitPercent),
    proposedPrice: text(stored.proposedPrice, ""),
  };
}

/**
 * Rebuilds the CalculatorDraft blob the existing mapper already understands.
 * Shop fields and extra-wage come from the profile. Each job row's wage is
 * looked up by rateId; a missing rate becomes a blank wage, not an error.
 */
export function compose(profile: BusinessProfile, job: JobDraft): CalculatorDraft {
  const wagesByRateId = new Map(profile.crewRates.map((rate) => [rate.id, rate.hourlyWage]));

  return {
    jobName: job.jobName,
    laborRows: job.laborRows.map((row) => ({
      id: row.id,
      hourlyWage: wagesByRateId.get(row.rateId) ?? "",
      workers: row.workers,
      regularHours: row.regularHours,
      overtimeHours: row.overtimeHours,
      overtimeMultiplier: row.overtimeMultiplier,
    })),
    extraWageCostPercent: profile.extraWageCostPercent,
    materialRows: job.materialRows.map((row) => ({ ...row })),
    otherCostRows: job.otherCostRows.map((row) => ({ ...row })),
    annualBusinessCosts: profile.annualBusinessCosts,
    annualSellableHours: profile.annualSellableHours,
    manualJobHours: job.manualJobHours,
    targetProfitPercent: job.targetProfitPercent,
    proposedPrice: job.proposedPrice,
  };
}

/**
 * Splits a v1 CalculatorDraft so wages are not dropped. Each distinct stored
 * hourlyWage becomes one crew rate; every row that had that wage points at it.
 */
export function splitDraft(draft: CalculatorDraft): { profile: BusinessProfile; job: JobDraft } {
  const crewRates: CrewRate[] = [];
  const rateIdByWage = new Map<string, string>();

  const laborRows = draft.laborRows.map((row) => {
    let rateId = rateIdByWage.get(row.hourlyWage);
    if (rateId === undefined) {
      rateId = createRowId("rate");
      rateIdByWage.set(row.hourlyWage, rateId);
      crewRates.push({
        id: rateId,
        hourlyWage: row.hourlyWage,
        label: "",
      });
    }

    return {
      id: row.id,
      rateId,
      workers: row.workers,
      regularHours: row.regularHours,
      overtimeHours: row.overtimeHours,
      overtimeMultiplier: row.overtimeMultiplier,
    };
  });

  return {
    profile: {
      annualBusinessCosts: draft.annualBusinessCosts,
      annualSellableHours: draft.annualSellableHours,
      extraWageCostPercent: draft.extraWageCostPercent,
      crewRates,
    },
    job: {
      jobName: draft.jobName,
      laborRows,
      materialRows: draft.materialRows.map((row) => ({ ...row })),
      otherCostRows: draft.otherCostRows.map((row) => ({ ...row })),
      manualJobHours: draft.manualJobHours,
      targetProfitPercent: draft.targetProfitPercent,
      proposedPrice: draft.proposedPrice,
    },
  };
}

/** Repair a raw :draft:v1 value, then split it into profile + job. */
export function splitRevivedDraft(value: unknown): { profile: BusinessProfile; job: JobDraft } | null {
  const draft = reviveDraft(value);
  if (!draft) return null;
  return splitDraft(draft);
}
