import { afterEach, describe, expect, it } from "vitest";
import { applyPlaneDraft, bindPlanePreview, collectPlaneDraft } from "../../lib/planeBridge.js";
import { createEmptyDraft, type CalculatorDraft } from "../../lib/calculatorState.js";

describe("plane bridge", () => {
  afterEach(() => {
    bindPlanePreview(
      () => createEmptyDraft(),
      () => undefined,
    )();
  });

  it("merges a partial save onto the live calculator", () => {
    let draft = createEmptyDraft();
    draft = { ...draft, jobName: "Kitchen remodel - Smith", laborRows: [{ ...draft.laborRows[0]!, hourlyWage: "25" }] };
    bindPlanePreview(
      () => draft,
      (next) => {
        draft = next;
      },
    );
    applyPlaneDraft({ jobName: "Demo Send Job", hourlyWage: "77" });
    expect(draft.jobName).toBe("Demo Send Job");
    expect(draft.laborRows[0]?.hourlyWage).toBe("25");
    expect(collectPlaneDraft()?.jobName).toBe("Demo Send Job");
  });

  it("replaces the calculator when a full draft comes back", () => {
    let draft = createEmptyDraft();
    bindPlanePreview(
      () => draft,
      (next) => {
        draft = next;
      },
    );
    const next = { ...createEmptyDraft(), jobName: "Deck", laborRows: [{ ...createEmptyDraft().laborRows[0]!, hourlyWage: "77" }] } satisfies CalculatorDraft;
    applyPlaneDraft(next);
    expect(draft).toEqual(next);
  });
});
