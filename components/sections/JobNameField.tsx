"use client";

import { TextField } from "../ui/Fields.js";
import type { CalculatorDraft } from "../../lib/calculatorState.js";

interface Props {
  draft: CalculatorDraft;
  update: (patch: Partial<CalculatorDraft>) => void;
}

/**
 * A slim line rather than a numbered step. Naming the job is bookkeeping for
 * the contractor, not something the price depends on, so it never blocks a
 * result and it does not open the form with a card full of admin.
 */
export function JobNameField({ draft, update }: Props) {
  return (
    <div className="job-name-bar">
      <TextField
        label="Job name"
        optional
        value={draft.jobName}
        onChange={(value) => update({ jobName: value })}
        placeholder="Kitchen remodel - Smith"
        help="Only so you can tell this job from the next one."
      />
    </div>
  );
}
