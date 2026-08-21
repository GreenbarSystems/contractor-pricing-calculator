"use client";

import { Disclosure, NumberField, Section, useFocusAddedRow } from "../ui/Fields.js";
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

  const focusAddedRow = useFocusAddedRow();

  const addRow = () => {
    const row = createLaborRow();
    update({ laborRows: [...draft.laborRows, row] });
    focusAddedRow(row.id);
  };

  const removeRow = (index: number) =>
    update({ laborRows: draft.laborRows.filter((_, rowIndex) => rowIndex !== index) });

  const extraWageError = errors.get("extraWageCostRate");

  return (
    <Section
      step="Step 1"
      title="Your crew"
      note="What you pay the people on this job, before taxes and benefits."
    >
      <div className="row-list">
        {draft.laborRows.map((row, index) => {
          const prefix = `laborItems.${index}`;
          const overtimeError =
            errors.get(`${prefix}.overtimeHoursPerWorker`) ?? errors.get(`${prefix}.overtimeMultiplier`);
          const hasOvertime = row.overtimeHours.trim() !== "" && Number(row.overtimeHours) > 0;

          return (
            <div className="row-card" key={row.id} id={row.id}>
              {draft.laborRows.length > 1 ? (
                <div className="row-card-head">
                  <span className="row-card-title">Crew line {index + 1}</span>
                  <button type="button" className="btn btn-remove" onClick={() => removeRow(index)}>
                    Remove<span className="visually-hidden"> crew line {index + 1}</span>
                  </button>
                </div>
              ) : null}

              <div className="row-grid crew-numbers">
                <NumberField
                  label="Hourly pay"
                  prefix="$"
                  value={row.hourlyWage}
                  onChange={(value) => setRow(index, { hourlyWage: value })}
                  placeholder="25"
                  error={errors.get(`${prefix}.hourlyWage`)}
                />
                <NumberField
                  label="Workers"
                  value={row.workers}
                  onChange={(value) => setRow(index, { workers: value })}
                  step="1"
                  error={errors.get(`${prefix}.workers`)}
                />
                <NumberField
                  label="Hours each"
                  suffix="hrs"
                  value={row.regularHours}
                  onChange={(value) => setRow(index, { regularHours: value })}
                  placeholder="40"
                  error={errors.get(`${prefix}.regularHoursPerWorker`)}
                />
              </div>

              <Disclosure
                summary={hasOvertime ? "Overtime" : "Add overtime"}
                forceOpen={hasOvertime || overtimeError !== undefined}
              >
                <div className="row-grid two-up">
                  <NumberField
                    label="Overtime hours each"
                    suffix="hrs"
                    value={row.overtimeHours}
                    onChange={(value) => setRow(index, { overtimeHours: value })}
                    error={errors.get(`${prefix}.overtimeHoursPerWorker`)}
                  />
                  <NumberField
                    label="Paid at this many times the hourly pay"
                    value={row.overtimeMultiplier}
                    onChange={(value) => setRow(index, { overtimeMultiplier: value })}
                    step="0.1"
                    help="Most contractors pay 1.5."
                    error={errors.get(`${prefix}.overtimeMultiplier`)}
                  />
                </div>
              </Disclosure>
            </div>
          );
        })}
      </div>

      <button type="button" className="btn btn-add" onClick={addRow}>
        + Add another crew line
      </button>

      {/* Already set to a workable default, so this is shown as a line they can
          open rather than a percentage they have to answer up front. */}
      <Disclosure
        className="inline-setting"
        forceOpen={extraWageError !== undefined}
        summary={
          <>
            {customerLanguage.extraWageCosts.label}:{" "}
            <strong>{draft.extraWageCostPercent.trim() === "" ? "0" : draft.extraWageCostPercent}%</strong>{" "}
            of crew pay — 28% is a starting point
          </>
        }
      >
        <NumberField
          label={customerLanguage.extraWageCosts.label}
          suffix="%"
          value={draft.extraWageCostPercent}
          onChange={(value) => update({ extraWageCostPercent: value })}
          help={`${customerLanguage.extraWageCosts.help} Many contractors land somewhere between 20% and 40%.`}
          error={extraWageError}
        />
      </Disclosure>

      {crewHours > 0 ? (
        <p className="section-note running-total">
          Crew hours on this job: <strong>{crewHours.toLocaleString("en-US")}</strong>
        </p>
      ) : null}
    </Section>
  );
}
