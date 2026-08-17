"use client";

import { Section, TextField } from "../ui/Fields.js";
import type { CalculatorDraft } from "../../lib/calculatorState.js";

interface Props {
  draft: CalculatorDraft;
  update: (patch: Partial<CalculatorDraft>) => void;
  errors: Map<string, string>;
}

export function JobDetailsSection({ draft, update, errors }: Props) {
  return (
    <Section step="Step 1" title="About this job" note="Just enough to tell this job apart from the next one.">
      <div className="field-grid two">
        <TextField
          label="Job name"
          value={draft.jobName}
          onChange={(value) => update({ jobName: value })}
          placeholder="Kitchen remodel - Smith"
          error={errors.get("jobName")}
        />
        <TextField
          label="Your reference"
          optional
          value={draft.jobReference}
          onChange={(value) => update({ jobReference: value })}
          placeholder="Estimate 1042"
          help="A quote number, address, or anything you use to find this job later."
        />
      </div>
    </Section>
  );
}
