"use client";

import { NumberField, Section, TextField } from "../ui/Fields.js";
import { createLaborRow, type CalculatorDraft, type LaborRowDraft } from "../../lib/calculatorState.js";
import { customerLanguage } from "../../src/pricing/index.js";

interface Props {
  draft: CalculatorDraft;
  update: (patch: Partial<CalculatorDraft>) => void;
  errors: Map<string, string>;
  crewHours: number;
}

export function CrewSection({ draft, update, errors, crewHours }: Props) {
  const setRow = (index: number, patch: Partial<LaborRowDraft>) => {
    update({
      laborRows: draft.laborRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    });
  };

  const addRow = () => update({ laborRows: [...draft.laborRows, createLaborRow()] });

  const removeRow = (index: number) =>
    update({ laborRows: draft.laborRows.filter((_, rowIndex) => rowIndex !== index) });

  return (
    <Section
      step="Step 2"
      title="Your crew"
      note="Add a line for each kind of worker on this job. Use the pay rate you actually pay them, before taxes and benefits."
    >
      <div className="row-list">
        {draft.laborRows.map((row, index) => {
          const prefix = `laborItems.${index}`;
          const hasOvertime = row.overtimeHours.trim() !== "" && Number(row.overtimeHours) > 0;

          return (
            <div className="row-card" key={row.id}>
              <div className="row-card-head">
                <span className="row-card-title">Crew line {index + 1}</span>
                {draft.laborRows.length > 1 ? (
                  <button type="button" className="btn btn-remove" onClick={() => removeRow(index)}>
                    Remove<span className="visually-hidden"> crew line {index + 1}</span>
                  </button>
                ) : null}
              </div>

              <div className="row-grid crew-top">
                <TextField
                  label="Who is doing the work"
                  value={row.description}
                  onChange={(value) => setRow(index, { description: value })}
                  placeholder="Lead carpenter"
                />
                <NumberField
                  label="Hourly pay"
                  prefix="$"
                  value={row.hourlyWage}
                  onChange={(value) => setRow(index, { hourlyWage: value })}
                  placeholder="25"
                  error={errors.get(`${prefix}.hourlyWage`)}
                />
              </div>

              <div className="row-grid crew-numbers" style={{ marginTop: 14 }}>
                <NumberField
                  label="How many workers"
                  value={row.workers}
                  onChange={(value) => setRow(index, { workers: value })}
                  step="1"
                  error={errors.get(`${prefix}.workers`)}
                />
                <NumberField
                  label="Regular hours each"
                  suffix="hrs"
                  value={row.regularHours}
                  onChange={(value) => setRow(index, { regularHours: value })}
                  placeholder="40"
                  error={errors.get(`${prefix}.regularHoursPerWorker`)}
                />
                <NumberField
                  label="Overtime hours each"
                  optional
                  suffix="hrs"
                  value={row.overtimeHours}
                  onChange={(value) => setRow(index, { overtimeHours: value })}
                  error={errors.get(`${prefix}.overtimeHoursPerWorker`)}
                />
              </div>

              <details className="overtime-details" open={hasOvertime}>
                <summary>Overtime pay rate</summary>
                <div className="overtime-body">
                  <NumberField
                    label="Overtime is paid at this many times the hourly pay"
                    value={row.overtimeMultiplier}
                    onChange={(value) => setRow(index, { overtimeMultiplier: value })}
                    step="0.1"
                    help="Most contractors pay 1.5. Change it only if you pay something different."
                    error={errors.get(`${prefix}.overtimeMultiplier`)}
                  />
                </div>
              </details>
            </div>
          );
        })}
      </div>

      <button type="button" className="btn btn-add" onClick={addRow}>
        + Add another crew line
      </button>

      <div className="field-grid" style={{ marginTop: 24 }}>
        <NumberField
          label={customerLanguage.extraWageCosts.label}
          suffix="%"
          value={draft.extraWageCostPercent}
          onChange={(value) => update({ extraWageCostPercent: value })}
          help={`${customerLanguage.extraWageCosts.help} Enter it as a percentage of what you pay your crew. Many contractors use somewhere between 20% and 40%.`}
          error={errors.get("extraWageCostRate")}
        />
      </div>

      <p className="section-note" style={{ marginTop: 16, marginBottom: 0 }}>
        Crew hours on this job: <strong>{crewHours.toLocaleString("en-US")}</strong>
      </p>
    </Section>
  );
}
