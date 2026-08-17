"use client";

import { NumberField, Section } from "../ui/Fields.js";
import { profitGoalChoices, type CalculatorDraft } from "../../lib/calculatorState.js";
import { customerLanguage } from "../../src/pricing/index.js";

interface Props {
  draft: CalculatorDraft;
  update: (patch: Partial<CalculatorDraft>) => void;
  errors: Map<string, string>;
}

export function ProfitGoalSection({ draft, update, errors }: Props) {
  const profitError = errors.get("targetProfitRate");

  return (
    <Section
      step="Step 3"
      title="Your profit goal"
      note="How much of the customer's payment you want to keep after the costs above are paid."
    >
      <fieldset className="choice-row" aria-describedby="profit-goal-help">
        <legend className="visually-hidden">{customerLanguage.targetProfit.label}</legend>
        {profitGoalChoices.map((choice) => (
          <label className="choice" key={choice}>
            <input
              type="radio"
              name="profit-goal"
              value={choice}
              checked={draft.targetProfitPercent === choice}
              onChange={() => update({ targetProfitPercent: choice })}
            />
            <span>{choice}%</span>
          </label>
        ))}
      </fieldset>

      <p className="help" id="profit-goal-help" style={{ marginTop: 10 }}>
        {customerLanguage.targetProfit.help} Pick one of these or type your own below.
      </p>

      <div className="field-grid two" style={{ marginTop: 20 }}>
        <NumberField
          label="Or set your own profit goal"
          suffix="%"
          value={draft.targetProfitPercent}
          onChange={(value) => update({ targetProfitPercent: value })}
          help="Must be less than 100%."
          error={profitError}
        />
        <NumberField
          label={customerLanguage.proposedPrice.label}
          prefix="$"
          optional
          value={draft.proposedPrice}
          onChange={(value) => update({ proposedPrice: value })}
          help={customerLanguage.proposedPrice.help}
          error={errors.get("proposedPrice")}
        />
      </div>
    </Section>
  );
}
