"use client";

import { TextField } from "../ui/Fields.js";
import type { CalculatorDraft } from "../../lib/calculatorState.js";

interface Props {
  draft: CalculatorDraft;
  update: (patch: Partial<CalculatorDraft>) => void;
  restored?: boolean;
}

/**
 * A slim line rather than a numbered step. Naming the job is bookkeeping for
 * the contractor, not something the price depends on, so it never blocks a
 * result and it does not open the form with a card full of admin.
 */
export function JobNameField({ draft, update, restored = false }: Props) {
  return (
    <div className="job-name-bar">
      <TextField
        label="Job name"
        optional
        autoComplete="off"
        value={draft.jobName}
        onChange={(value) => update({ jobName: value })}
        placeholder="Kitchen remodel - Smith"
        help="Only so you can tell this job from the next one."
      />
      {restored ? (
        <p className="visually-hidden" role="status">
          Your last job was restored on this device.
        </p>
      ) : null}
    </div>
  );
}
