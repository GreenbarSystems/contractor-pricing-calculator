import { describe, expect, it } from "vitest";
import {
  createEmptyDraft,
  draftToPricingInput,
  issuesByPath,
  reviveDraft,
  totalCrewHours,
  type CalculatorDraft,
} from "../../lib/calculatorState.js";
import { calculateJobPrice, validateJobPricingInput } from "../../src/pricing/index.js";

const filledDraft = (): CalculatorDraft => ({
  ...createEmptyDraft(),
  jobName: "Kitchen remodel - Smith",
  laborRows: [
    {
      id: "crew-1",
      description: "Carpenter",
      hourlyWage: "25",
      workers: "2",
      regularHours: "40",
      overtimeHours: "",
      overtimeMultiplier: "1.5",
    },
  ],
  extraWageCostPercent: "28",
  materialRows: [{ id: "material-1", description: "Lumber", quantity: "1", unitCost: "2000" }],
  otherCostRows: [{ id: "other-1", description: "Permit", amount: "250", category: "permit" }],
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
    const draft = { ...filledDraft(), annualBusinessCosts: "", annualSellableHours: "" };
    const input = draftToPricingInput(draft);

    expect(input.businessCosts).toEqual({ annualBusinessCosts: 0, annualSellableHours: 0 });
    expect(validateJobPricingInput(input).isValid).toBe(true);
  });

  it("leaves blank optional fields undefined", () => {
    const input = draftToPricingInput(filledDraft());

    expect(input.proposedPrice).toBeUndefined();
    expect(input.manualJobHours).toBeUndefined();
    expect(input.jobReference).toBeUndefined();
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

describe("validation surfaced to the form", () => {
  it("asks for a job name before pricing anything", () => {
    const validation = validateJobPricingInput(draftToPricingInput(createEmptyDraft()));

    expect(issuesByPath(validation).get("jobName")).toBe("Enter a name for this job.");
  });

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

  it("asks for sellable hours once annual business costs are entered", () => {
    const validation = validateJobPricingInput(
      draftToPricingInput({ ...filledDraft(), annualSellableHours: "" }),
    );

    expect(issuesByPath(validation).has("businessCosts.annualSellableHours")).toBe(true);
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

  it("replaces an unknown job-cost category with a safe one", () => {
    const revived = reviveDraft({ otherCostRows: [{ amount: "100", category: "wildcard" }] });

    expect(revived?.otherCostRows[0]!.category).toBe("other");
  });
});
