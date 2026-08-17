import type { JobPricingInput, ValidationResult } from "../src/pricing/index.js";

/**
 * The form keeps every number as a string so a contractor can clear a field or
 * type a partial number without the calculator fighting them. Numbers are only
 * produced when the draft is handed to the pricing engine.
 *
 * Rows carry only what the engine actually prices. Descriptions and cost
 * categories were dropped from crew and material rows because nothing read
 * them and nothing showed them back.
 */

export interface LaborRowDraft {
  id: string;
  hourlyWage: string;
  workers: string;
  regularHours: string;
  overtimeHours: string;
  overtimeMultiplier: string;
}

export interface MaterialRowDraft {
  id: string;
  quantity: string;
  unitCost: string;
}

/** Miscellaneous by nature, so this one keeps a label the contractor writes. */
export interface OtherCostRowDraft {
  id: string;
  description: string;
  amount: string;
}

export interface CalculatorDraft {
  jobName: string;
  laborRows: LaborRowDraft[];
  extraWageCostPercent: string;
  materialRows: MaterialRowDraft[];
  otherCostRows: OtherCostRowDraft[];
  annualBusinessCosts: string;
  annualSellableHours: string;
  manualJobHours: string;
  targetProfitPercent: string;
  proposedPrice: string;
}

export const profitGoalChoices = ["10", "15", "20", "25", "30", "35"] as const;

/**
 * The engine wants a job name, but a contractor should get a price before
 * being asked to name anything. Naming the job stays optional in the form.
 */
export const FALLBACK_JOB_NAME = "Untitled job";

let rowCounter = 0;

/**
 * Row ids only need to be stable within one browsing session, and they must not
 * come from Date.now()/Math.random() during render or the server and client
 * markup would disagree on first paint.
 */
export function createRowId(prefix: string): string {
  rowCounter += 1;
  return `${prefix}-${rowCounter}`;
}

export function createLaborRow(): LaborRowDraft {
  return {
    id: createRowId("crew"),
    hourlyWage: "",
    workers: "1",
    regularHours: "",
    overtimeHours: "",
    overtimeMultiplier: "1.5",
  };
}

export function createMaterialRow(): MaterialRowDraft {
  return { id: createRowId("material"), quantity: "1", unitCost: "" };
}

export function createOtherCostRow(): OtherCostRowDraft {
  return { id: createRowId("other"), description: "", amount: "" };
}

export function createEmptyDraft(): CalculatorDraft {
  return {
    jobName: "",
    laborRows: [createLaborRow()],
    extraWageCostPercent: "28",
    materialRows: [createMaterialRow()],
    otherCostRows: [],
    annualBusinessCosts: "",
    annualSellableHours: "",
    manualJobHours: "",
    targetProfitPercent: "20",
    proposedPrice: "",
  };
}

/** A blank field means "nothing yet", which prices as zero rather than as an error. */
function toNumber(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return Number(trimmed);
}

/** Optional money/hours fields stay undefined while blank so the engine can skip them. */
function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed);
}

function percentToRate(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed / 100 : Number.NaN;
}

/**
 * Business costs only mean something once both halves are present, since the
 * engine divides one by the other. A half-filled pair is treated as "not yet"
 * rather than as an error, so a contractor still gets a price and the engine's
 * own "business costs are not included" warning does the explaining.
 */
export function businessCostsAreUsable(draft: CalculatorDraft): boolean {
  return toNumber(draft.annualBusinessCosts) > 0 && toNumber(draft.annualSellableHours) > 0;
}

/** True once they have started on business costs but the pair is not complete. */
export function businessCostsNeedHours(draft: CalculatorDraft): boolean {
  return toNumber(draft.annualBusinessCosts) > 0 && !(toNumber(draft.annualSellableHours) > 0);
}

export function businessCostsStarted(draft: CalculatorDraft): boolean {
  return (
    draft.annualBusinessCosts.trim() !== "" ||
    draft.annualSellableHours.trim() !== "" ||
    draft.manualJobHours.trim() !== ""
  );
}

export function draftToPricingInput(draft: CalculatorDraft): JobPricingInput {
  const jobName = draft.jobName.trim();

  return {
    jobName: jobName === "" ? FALLBACK_JOB_NAME : jobName,
    laborItems: draft.laborRows.map((row) => ({
      id: row.id,
      description: "",
      hourlyWage: toNumber(row.hourlyWage),
      workers: toNumber(row.workers),
      regularHoursPerWorker: toNumber(row.regularHours),
      overtimeHoursPerWorker: toNumber(row.overtimeHours),
      // Blank falls back to time-and-a-half; a typed 0 is left alone so validation can flag it.
      overtimeMultiplier: row.overtimeMultiplier.trim() === "" ? 1.5 : Number(row.overtimeMultiplier),
    })),
    extraWageCostRate: percentToRate(draft.extraWageCostPercent),
    materialItems: draft.materialRows.map((row) => ({
      id: row.id,
      description: "",
      quantity: toNumber(row.quantity),
      unitCost: toNumber(row.unitCost),
    })),
    otherJobCostItems: draft.otherCostRows.map((row) => ({
      id: row.id,
      description: row.description,
      amount: toNumber(row.amount),
      category: "other" as const,
    })),
    ...(businessCostsAreUsable(draft)
      ? {
          businessCosts: {
            annualBusinessCosts: toNumber(draft.annualBusinessCosts),
            annualSellableHours: toNumber(draft.annualSellableHours),
          },
        }
      : {}),
    manualJobHours: toOptionalNumber(draft.manualJobHours),
    targetProfitRate: percentToRate(draft.targetProfitPercent),
    proposedPrice: toOptionalNumber(draft.proposedPrice),
  };
}

/** Crew hours drive the business-cost share, so the form needs the same total the engine uses. */
export function totalCrewHours(draft: CalculatorDraft): number {
  return draft.laborRows.reduce((total, row) => {
    const workers = toNumber(row.workers);
    const hours = toNumber(row.regularHours) + toNumber(row.overtimeHours);
    const rowHours = workers * hours;
    return total + (Number.isFinite(rowHours) ? rowHours : 0);
  }, 0);
}

/**
 * The engine reports issues by path (for example `laborItems.0.hourlyWage`).
 * The form looks messages up by that same path to place them under a field.
 */
export function issuesByPath(validation: ValidationResult): Map<string, string> {
  const map = new Map<string, string>();
  for (const issue of validation.issues) {
    if (!map.has(issue.path)) {
      map.set(issue.path, issue.message);
    }
  }
  return map;
}

export const DRAFT_STORAGE_KEY = "contractor-pricing-calculator:draft:v1";

/**
 * Stored drafts come from an older version of this form, so every field is
 * re-checked against the current shape instead of being trusted. Fields this
 * form no longer has are simply not read.
 */
export function reviveDraft(value: unknown): CalculatorDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const stored = value as Partial<Record<keyof CalculatorDraft, unknown>>;
  const fallback = createEmptyDraft();

  const text = (input: unknown, fallbackText: string): string =>
    typeof input === "string" ? input : fallbackText;

  const asRecord = (row: unknown): Record<string, unknown> =>
    (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;

  const laborRows = Array.isArray(stored.laborRows)
    ? stored.laborRows.map((row) => {
        const source = asRecord(row);
        const blank = createLaborRow();
        return {
          id: text(source.id, blank.id),
          hourlyWage: text(source.hourlyWage, ""),
          workers: text(source.workers, "1"),
          regularHours: text(source.regularHours, ""),
          overtimeHours: text(source.overtimeHours, ""),
          overtimeMultiplier: text(source.overtimeMultiplier, "1.5"),
        };
      })
    : fallback.laborRows;

  const materialRows = Array.isArray(stored.materialRows)
    ? stored.materialRows.map((row) => {
        const source = asRecord(row);
        const blank = createMaterialRow();
        return {
          id: text(source.id, blank.id),
          quantity: text(source.quantity, "1"),
          unitCost: text(source.unitCost, ""),
        };
      })
    : fallback.materialRows;

  const otherCostRows = Array.isArray(stored.otherCostRows)
    ? stored.otherCostRows.map((row) => {
        const source = asRecord(row);
        const blank = createOtherCostRow();
        return {
          id: text(source.id, blank.id),
          description: text(source.description, ""),
          amount: text(source.amount, ""),
        };
      })
    : fallback.otherCostRows;

  return {
    jobName: text(stored.jobName, ""),
    laborRows: laborRows.length > 0 ? laborRows : fallback.laborRows,
    extraWageCostPercent: text(stored.extraWageCostPercent, fallback.extraWageCostPercent),
    materialRows: materialRows.length > 0 ? materialRows : fallback.materialRows,
    otherCostRows,
    annualBusinessCosts: text(stored.annualBusinessCosts, ""),
    annualSellableHours: text(stored.annualSellableHours, ""),
    manualJobHours: text(stored.manualJobHours, ""),
    targetProfitPercent: text(stored.targetProfitPercent, fallback.targetProfitPercent),
    proposedPrice: text(stored.proposedPrice, ""),
  };
}

export function loadDraft(): CalculatorDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return reviveDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveDraft(draft: CalculatorDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // A full or blocked storage quota must never break the calculator.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Ignored for the same reason as saveDraft.
  }
}
