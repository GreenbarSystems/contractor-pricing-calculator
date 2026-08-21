"use client";

import { Disclosure, NumberField } from "../ui/Fields.js";
import {
  businessCostsAreUsable,
  businessCostsNeedHours,
  businessCostsStarted,
  type CalculatorDraft,
} from "../../lib/calculatorState.js";
import { customerLanguage } from "../../src/pricing/index.js";

interface Props {
  draft: CalculatorDraft;
  update: (patch: Partial<CalculatorDraft>) => void;
  errors: Map<string, string>;
  crewHours: number;
}

/**
 * Deliberately not a numbered step. Most contractors have never worked out what
 * a year of running their business costs, and being asked before they have a
 * price is what makes a calculator feel like homework. The price comes first;
 * this is the offer to make that price cover the truck as well.
 */
export function BusinessCostsSection({ draft, update, errors, crewHours }: Props) {
  return (
    <section className="section optional-section" aria-labelledby="business-costs-heading">
      <h2 id="business-costs-heading" className="visually-hidden">
        {customerLanguage.businessCosts.label}
      </h2>
      <Disclosure
        forceOpen={businessCostsStarted(draft)}
        summary={
          <>
            <span className="optional-tag">Optional</span>
            <span className="optional-summary-title">
              Should this price help pay for your truck, insurance, and phone?
            </span>
          </>
        }
      >
        <p className="section-note">
          Running your business costs money whether or not you are on a job. If you know roughly what
          a year costs you, this shares a fair slice of it onto this job. Skip it and your price
          simply will not include it.
        </p>

        <div className="field-grid two-up">
          <NumberField
            label="What it costs to run your business for a year"
            prefix="$"
            value={draft.annualBusinessCosts}
            onChange={(value) => update({ annualBusinessCosts: value })}
            placeholder="75000"
            help="Trucks, insurance, phone, software, the office, advertising. A rough number is fine."
            error={errors.get("businessCosts.annualBusinessCosts")}
          />
          <NumberField
            label={customerLanguage.annualSellableHours.label}
            suffix="hrs"
            value={draft.annualSellableHours}
            onChange={(value) => update({ annualSellableHours: value })}
            placeholder="4000"
            help={customerLanguage.annualSellableHours.help}
            error={errors.get("businessCosts.annualSellableHours")}
          />
        </div>

        {businessCostsNeedHours(draft) ? (
          <p className="soft-hint" role="status">
            Add the hours you expect to sell and this will be shared onto the job. Until then your
            price is based on job costs only.
          </p>
        ) : null}

        {businessCostsAreUsable(draft) && crewHours === 0 ? (
          <div className="field-grid spaced-top">
            <NumberField
              label="How many hours will this job take"
              suffix="hrs"
              value={draft.manualJobHours}
              onChange={(value) => update({ manualJobHours: value })}
              help="You have not entered crew hours yet, so this is how the share gets worked out."
              error={errors.get("manualJobHours")}
            />
          </div>
        ) : null}
      </Disclosure>
    </section>
  );
}
