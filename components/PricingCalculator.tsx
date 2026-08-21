"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BusinessCostsSection } from "./sections/BusinessCostsSection.js";
import { CrewSection } from "./sections/CrewSection.js";
import { JobNameField } from "./sections/JobNameField.js";
import { ProfitGoalSection } from "./sections/ProfitGoalSection.js";
import { PurchasesSection } from "./sections/PurchasesSection.js";
import { ResultsPanel } from "./ResultsPanel.js";
import {
  clearDraft,
  createEmptyDraft,
  draftToPricingInput,
  issuesByPath,
  loadDraft,
  saveDraft,
  totalCrewHours,
  withVisibleIssueMessages,
  type CalculatorDraft,
} from "../lib/calculatorState.js";
import {
  calculateJobPrice,
  customerLanguage,
  formatCurrency,
  validateJobPricingInput,
} from "../src/pricing/index.js";

export function PricingCalculator() {
  const [draft, setDraft] = useState<CalculatorDraft>(createEmptyDraft);

  // The first paint has to match the server, so a saved draft is applied after
  // mount rather than read during render.
  const [restored, setRestored] = useState(false);
  const [draftWasRestored, setDraftWasRestored] = useState(false);

  useEffect(() => {
    const stored = loadDraft();
    if (stored) {
      setDraft(stored);
      setDraftWasRestored(true);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveDraft(draft);
  }, [draft, restored]);

  const update = useCallback((patch: Partial<CalculatorDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const input = useMemo(() => draftToPricingInput(draft), [draft]);
  const validation = useMemo(() => validateJobPricingInput(input), [input]);
  const errors = useMemo(() => issuesByPath(validation), [validation]);

  // calculateJobPrice throws on invalid input, so it is only called once the
  // same validation the engine runs has already passed.
  const result = useMemo(
    () => (validation.isValid ? calculateJobPrice(input) : null),
    [input, validation.isValid],
  );

  const crewHours = useMemo(() => totalCrewHours(draft), [draft]);

  const startOver = () => {
    if (typeof window !== "undefined" && !window.confirm("Clear this job and start over?")) return;
    clearDraft();
    setDraft(createEmptyDraft());
    setDraftWasRestored(false);
  };

  return (
    <div className="layout" id="calculator" tabIndex={-1}>
      <div className="form-column">
        <JobNameField draft={draft} update={update} restored={draftWasRestored} />
        <CrewSection draft={draft} update={update} errors={errors} crewHours={crewHours} />
        <PurchasesSection draft={draft} update={update} errors={errors} />
        <ProfitGoalSection draft={draft} update={update} errors={errors} />
        {/* After the three steps, not among them: the price exists by now. */}
        <BusinessCostsSection draft={draft} update={update} errors={errors} crewHours={crewHours} />

        <div className="footer-note">
          <span>Your numbers stay in this browser. Nothing is sent anywhere and no account is needed.</span>
          <button type="button" className="btn btn-quiet" onClick={startOver}>
            Start over
          </button>
        </div>
      </div>

      <div className="results-rail">
        <ResultsPanel input={input} result={result} issues={withVisibleIssueMessages(validation.issues)} />
      </div>

      {/* Phone-only running total. The full panel below already announces this,
          so it is hidden from screen readers and holds nothing focusable. */}
      <div className="mobile-price-bar" aria-hidden="true">
        {result && result.totalJobCost > 0 ? (
          <>
            <span className="mobile-price-label">{customerLanguage.recommendedPrice.label}</span>
            <span className="mobile-price-amount">{formatCurrency(result.recommendedPrice)}</span>
          </>
        ) : result === null ? (
          <span className="mobile-price-label">A few numbers need a second look</span>
        ) : (
          <span className="mobile-price-label">Your price appears here as you fill this in</span>
        )}
      </div>
    </div>
  );
}
