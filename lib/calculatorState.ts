import type {
  JobPricingInput,
  OtherJobCostCategory,
  ValidationResult,
} from "../src/pricing/index.js";

/**
 * The form keeps every number as a string so a contractor can clear a field or
 * type a partial number without the calculator fighting them. Numbers are only
 * produced when the draft is handed to the pricing engine.
 */

export interface LaborRowDraft {
  id: string;
  description: string;
  hourlyWage: string;
  workers: string;
  regularHours: string;
  overtimeHours: string;
  overtimeMultiplier: string;
}

export interface MaterialRowDraft {
  id: string;
  description: string;
  quantity: string;
  unitCost: string;
}

export interface OtherCostRowDraft {
  id: string;
  description: string;
  amount: string;
  category: OtherJobCostCategory;
}

export interface CalculatorDraft {
  jobName: string;
  jobReference: string;
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

export const otherJobCostCategories: { value: OtherJobCostCategory; label: string }[] = [
  { value: "subcontractor", label: "Subcontractor" },
  { value: "equipment", label: "Equipment rental" },
  { value: "permit", label: "Permit" },
  { value: "delivery", label: "Delivery" },
  { value: "disposal", label: "Disposal or dump fees" },
  { value: "other", label: "Something else" },
];

export const profitGoalChoices = ["10", "15", "20", "25", "30", "35"] as const;

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
    description: "",
    hourlyWage: "",
    workers: "1",
    regularHours: "",
    overtimeHours: "",
    overtimeMultiplier: "1.5",
  };
}

export function createMaterialRow(): MaterialRowDraft {
  return { id: createRowId("material"), description: "", quantity: "1", unitCost: "" };
}

export function createOtherCostRow(): OtherCostRowDraft {
  return { id: createRowId("other"), description: "", amount: "", category: "other" };
}

export function createEmptyDraft(): CalculatorDraft {
  return {
    jobName: "",
    jobReference: "",
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

export function draftToPricingInput(draft: CalculatorDraft): JobPricingInput {
  const jobReference = draft.jobReference.trim();

  return {
    jobName: draft.jobName,
    ...(jobReference === "" ? {} : { jobReference }),
    laborItems: draft.laborRows.map((row) => ({
      id: row.id,
      description: row.description,
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
      description: row.description,
      quantity: toNumber(row.quantity),
      unitCost: toNumber(row.unitCost),
    })),
    otherJobCostItems: draft.otherCostRows.map((row) => ({
      id: row.id,
      description: row.description,
      amount: toNumber(row.amount),
      category: row.category,
    })),
    businessCosts: {
      annualBusinessCosts: toNumber(draft.annualBusinessCosts),
      annualSellableHours: toNumber(draft.annualSellableHours),
    },
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
 * re-checked against the current shape instead of being trusted.
 */
export function reviveDraft(value: unknown): CalculatorDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const stored = value as Partial<Record<keyof CalculatorDraft, unknown>>;
  const fallback = createEmptyDraft();

  const text = (input: unknown, fallbackText: string): string =>
    typeof input === "string" ? input : fallbackText;

  const laborRows = Array.isArray(stored.laborRows)
    ? stored.laborRows.map((row) => {
        const source = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;
        const blank = createLaborRow();
        return {
          id: text(source.id, blank.id),
          description: text(source.description, ""),
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
        const source = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;
        const blank = createMaterialRow();
        return {
          id: text(source.id, blank.id),
          description: text(source.description, ""),
          quantity: text(source.quantity, "1"),
          unitCost: text(source.unitCost, ""),
        };
      })
    : fallback.materialRows;

  const knownCategories = new Set(otherJobCostCategories.map((option) => option.value));
  const otherCostRows = Array.isArray(stored.otherCostRows)
    ? stored.otherCostRows.map((row) => {
        const source = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;
        const blank = createOtherCostRow();
        const category = source.category;
        return {
          id: text(source.id, blank.id),
          description: text(source.description, ""),
          amount: text(source.amount, ""),
          category:
            typeof category === "string" && knownCategories.has(category as OtherJobCostCategory)
              ? (category as OtherJobCostCategory)
              : ("other" as OtherJobCostCategory),
        };
      })
    : fallback.otherCostRows;

  return {
    jobName: text(stored.jobName, ""),
    jobReference: text(stored.jobReference, ""),
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
