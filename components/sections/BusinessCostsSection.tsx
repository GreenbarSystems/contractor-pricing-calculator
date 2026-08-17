"use client";

import { NumberField, Section } from "../ui/Fields.js";
import type { CalculatorDraft } from "../../lib/calculatorState.js";
import { customerLanguage } from "../../src/pricing/index.js";

interface Props {
  draft: CalculatorDraft;
  update: (patch: Partial<CalculatorDraft>) => void;
  errors: Map<string, string>;
  crewHours: number;
}

export function BusinessCostsSection({ draft, update, errors, crewHours }: Props) {
  return (
    <Section
      step="Step 4"
      title="Costs of running your business"
      note="Trucks, insurance, phone, software, the office, advertising, and the time you spend on estimates. This step spreads a fair share of those costs onto this job so your price helps pay for them."
    >
      <div className="field-grid two">
        <NumberField
          label="What it costs to run your business for a year"
          prefix="$"
          optional
          value={draft.annualBusinessCosts}
          onChange={(value) => update({ annualBusinessCosts: value })}
          placeholder="75000"
          help="Your best estimate is fine. Leave it blank if you are not ready to include it."
          error={errors.get("businessCosts.annualBusinessCosts")}
        />
        <NumberField
          label={customerLanguage.annualSellableHours.label}
          suffix="hrs"
          optional
          value={draft.annualSellableHours}
          onChange={(value) => update({ annualSellableHours: value })}
          placeholder="4000"
          help={customerLanguage.annualSellableHours.help}
          error={errors.get("businessCosts.annualSellableHours")}
        />
      </div>

      {crewHours === 0 ? (
        <div className="field-grid" style={{ marginTop: 18 }}>
          <NumberField
            label="How many hours will this job take"
            suffix="hrs"
            optional
            value={draft.manualJobHours}
            onChange={(value) => update({ manualJobHours: value })}
            help="You have not entered any crew hours yet. Enter the job hours here and your business costs will still be shared onto this job."
            error={errors.get("manualJobHours")}
          />
        </div>
      ) : null}
    </Section>
  );
}
