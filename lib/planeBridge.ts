import type { CalculatorDraft } from "./calculatorState.js";

type Getter = () => CalculatorDraft;
type Setter = (draft: CalculatorDraft) => void;

let get: Getter | null = null;
let set: Setter | null = null;

export function bindPlanePreview(getter: Getter, setter: Setter) {
  get = getter;
  set = setter;
  return () => {
    if (get === getter) get = null;
    if (set === setter) set = null;
  };
}

export function collectPlaneDraft(): CalculatorDraft | null {
  return get ? get() : null;
}

export function applyPlaneDraft(draft: unknown) {
  if (!set || !draft || typeof draft !== "object") return;
  set(draft as CalculatorDraft);
}
