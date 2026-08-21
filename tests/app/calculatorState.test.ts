import { describe, expect, it } from "vitest";
import {
  businessCostsAreUsable,
  businessCostsNeedHours,
  createEmptyDraft,
  draftToPricingInput,
  FALLBACK_JOB_NAME,
  issuesByPath,
  reviveDraft,
  totalCrewHours,
  toVisibleIssueMessage,
  type CalculatorDraft,
} from "../../lib/calculatorState.js";
import { calculateJobPrice, validateJobPricingInput } from "../../src/pricing/index.js";

const filledDraft = (): CalculatorDraft => ({
  ...createEmptyDraft(),
  jobName: "Kitchen remodel - Smith",
  laborRows: [
    {
      id: "crew-1",
      hourlyWage: "25",
      workers: "2",
      regularHours: "40",
      overtimeHours: "",
      overtimeMultiplier: "1.5",
    },
  ],
  extraWageCostPercent: "28",
  materialRows: [{ id: "material-1", quantity: "1", unitCost: "2000" }],
  otherCostRows: [{ id: "other-1", description: "Permit", amount: "250" }],
  annualBusinessCosts: "75000",
  annualSellableHours: "4000",
  targetProfitPercent: "20",
});

describe("draftToPricingInput", () => {
  it("reproduces the documented example price from typed form values", () => {
    const result = calculateJobPrice(draftToPricingInput(filledDraft()));

    expect(result.totalJobCost).toBe(6310);
    expect(result.recommendedPrice).toBe(7887.5);
  });

  it("turns typed percentages into rates", () => {
    const input = draftToPricingInput(filledDraft());

    expect(input.extraWageCostRate).toBe(0.28);
    expect(input.targetProfitRate).toBe(0.2);
  });

  it("treats blank number fields as zero rather than as an error", () => {
    const input = draftToPricingInput({ ...createEmptyDraft(), jobName: "Deck" });

    expect(validateJobPricingInput(input).isValid).toBe(true);
  });

  it("leaves blank optional fields undefined", () => {
    const input = draftToPricingInput(filledDraft());

    expect(input.proposedPrice).toBeUndefined();
    expect(input.manualJobHours).toBeUndefined();
  });

  it("passes a quoted price through when one is typed", () => {
    const input = draftToPricingInput({ ...filledDraft(), proposedPrice: "8000" });

    expect(input.proposedPrice).toBe(8000);
    expect(calculateJobPrice(input).proposedPriceStatus).toBe("meets-target");
  });

  it("falls back to time-and-a-half only when the multiplier is left blank", () => {
    const draft = filledDraft();
    const blank = draftToPricingInput({
      ...draft,
      laborRows: [{ ...draft.laborRows[0]!, overtimeHours: "5", overtimeMultiplier: "" }],
    });
    const typedZero = draftToPricingInput({
      ...draft,
      laborRows: [{ ...draft.laborRows[0]!, overtimeHours: "5", overtimeMultiplier: "0" }],
    });

    expect(blank.laborItems[0]!.overtimeMultiplier).toBe(1.5);
    expect(typedZero.laborItems[0]!.overtimeMultiplier).toBe(0);
    expect(validateJobPricingInput(typedZero).isValid).toBe(false);
  });
});

describe("naming a job never blocks a price", () => {
  it("prices an unnamed job so a contractor gets an answer first", () => {
    const draft = { ...filledDraft(), jobName: "" };
    const input = draftToPricingInput(draft);

    expect(input.jobName).toBe(FALLBACK_JOB_NAME);
    expect(validateJobPricingInput(input).isValid).toBe(true);
    expect(calculateJobPrice(input).recommendedPrice).toBe(7887.5);
  });

  it("prices a completely blank form without a single validation issue", () => {
    const validation = validateJobPricingInput(draftToPricingInput(createEmptyDraft()));

    expect(validation.isValid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("keeps a typed name", () => {
    expect(draftToPricingInput(filledDraft()).jobName).toBe("Kitchen remodel - Smith");
  });
});

describe("half-filled business costs", () => {
  it("is treated as not-yet rather than as an error", () => {
    const draft = { ...filledDraft(), annualSellableHours: "" };
    const input = draftToPricingInput(draft);

    expect(businessCostsNeedHours(draft)).toBe(true);
    expect(businessCostsAreUsable(draft)).toBe(false);
    expect(input.businessCosts).toBeUndefined();
    expect(validateJobPricingInput(input).isValid).toBe(true);
  });

  it("still returns a price, and warns that business costs are missing", () => {
    const result = calculateJobPrice(
      draftToPricingInput({ ...filledDraft(), annualSellableHours: "" }),
    );

    expect(result.totalJobCost).toBe(4810);
    expect(result.recommendedPrice).toBe(6012.5);
    expect(result.warnings.map((warning) => warning.code)).toContain("BUSINESS_COSTS_NOT_INCLUDED");
  });

  it("counts business costs once both halves are present", () => {
    const draft = filledDraft();

    expect(businessCostsAreUsable(draft)).toBe(true);
    expect(businessCostsNeedHours(draft)).toBe(false);
    expect(draftToPricingInput(draft).businessCosts).toEqual({
      annualBusinessCosts: 75000,
      annualSellableHours: 4000,
    });
  });
});

describe("validation surfaced to the form", () => {
  it("indexes row issues by the path the form looks up", () => {
    const draft = filledDraft();
    const validation = validateJobPricingInput(
      draftToPricingInput({
        ...draft,
        laborRows: [{ ...draft.laborRows[0]!, hourlyWage: "-5" }],
      }),
    );

    expect(issuesByPath(validation).has("laborItems.0.hourlyWage")).toBe(true);
  });

  it("flags a profit goal of 100% or more", () => {
    const validation = validateJobPricingInput(
      draftToPricingInput({ ...filledDraft(), targetProfitPercent: "100" }),
    );

    expect(issuesByPath(validation).has("targetProfitRate")).toBe(true);
  });

  it("maps engine field names to the labels shown on the form", () => {
    expect(toVisibleIssueMessage("Hourly wage must be a number that is zero or greater.")).toBe(
      "Hourly pay must be a number that is zero or greater.",
    );
    expect(toVisibleIssueMessage("Regular hours must be a number that is zero or greater.")).toBe(
      "Hours each must be a number that is zero or greater.",
    );
    expect(toVisibleIssueMessage("Material quantity must be a number that is zero or greater.")).toBe(
      "How many must be a number that is zero or greater.",
    );
    expect(toVisibleIssueMessage("Overtime multiplier must be greater than zero.")).toBe(
      "Paid at this many times the hourly pay must be greater than zero.",
    );
  });

  it("shows those visible labels on the paths the form looks up", () => {
    const draft = filledDraft();
    const validation = validateJobPricingInput(
      draftToPricingInput({
        ...draft,
        laborRows: [
          { ...draft.laborRows[0]!, hourlyWage: "-5", regularHours: "-1", overtimeMultiplier: "0" },
        ],
        materialRows: [{ ...draft.materialRows[0]!, quantity: "-1" }],
      }),
    );
    const errors = issuesByPath(validation);

    expect(errors.get("laborItems.0.hourlyWage")).toContain("Hourly pay");
    expect(errors.get("laborItems.0.regularHoursPerWorker")).toContain("Hours each");
    expect(errors.get("laborItems.0.overtimeMultiplier")).toContain(
      "Paid at this many times the hourly pay",
    );
    expect(errors.get("materialItems.0.quantity")).toContain("How many");
  });
});

describe("totalCrewHours", () => {
  it("counts every worker on every crew line, regular and overtime", () => {
    const draft = filledDraft();
    const hours = totalCrewHours({
      ...draft,
      laborRows: [
        { ...draft.laborRows[0]!, workers: "2", regularHours: "40", overtimeHours: "5" },
        { ...draft.laborRows[0]!, id: "crew-2", workers: "1", regularHours: "8", overtimeHours: "" },
      ],
    });

    expect(hours).toBe(98);
  });

  it("is zero for a blank form", () => {
    expect(totalCrewHours(createEmptyDraft())).toBe(0);
  });
});

describe("reviveDraft", () => {
  it("ignores stored values that are not shaped like a draft", () => {
    expect(reviveDraft(null)).toBeNull();
    expect(reviveDraft("nope")).toBeNull();
  });

  it("keeps saved values and repairs missing ones", () => {
    const revived = reviveDraft({ jobName: "Deck rebuild", laborRows: [{ hourlyWage: "30" }] });

    expect(revived?.jobName).toBe("Deck rebuild");
    expect(revived?.laborRows[0]!.hourlyWage).toBe("30");
    expect(revived?.laborRows[0]!.workers).toBe("1");
    expect(revived?.targetProfitPercent).toBe("20");
    expect(revived?.materialRows.length).toBeGreaterThan(0);
  });

  it("reads a draft saved by the older, wordier form", () => {
    const revived = reviveDraft({
      jobName: "Old job",
      jobReference: "Estimate 12",
      laborRows: [{ id: "crew-9", description: "Carpenter", hourlyWage: "40", regularHours: "8" }],
      materialRows: [{ id: "material-9", description: "Lumber", quantity: "2", unitCost: "50" }],
      otherCostRows: [{ id: "other-9", description: "Permit", amount: "100", category: "permit" }],
    });

    expect(revived?.laborRows[0]!.hourlyWage).toBe("40");
    expect(revived?.materialRows[0]!.unitCost).toBe("50");
    expect(revived?.otherCostRows[0]!.description).toBe("Permit");
    expect(revived && Object.keys(revived.laborRows[0]!)).not.toContain("description");
    expect(calculateJobPrice(draftToPricingInput(revived!)).totalJobCost).toBeGreaterThan(0);
  });
});
