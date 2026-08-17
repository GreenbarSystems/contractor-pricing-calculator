"use client";

import { NumberField, Section, SelectField, TextField } from "../ui/Fields.js";
import {
  createMaterialRow,
  createOtherCostRow,
  otherJobCostCategories,
  type CalculatorDraft,
  type MaterialRowDraft,
  type OtherCostRowDraft,
} from "../../lib/calculatorState.js";
import { customerLanguage, type OtherJobCostCategory } from "../../src/pricing/index.js";

interface Props {
  draft: CalculatorDraft;
  update: (patch: Partial<CalculatorDraft>) => void;
  errors: Map<string, string>;
}

export function PurchasesSection({ draft, update, errors }: Props) {
  const setMaterial = (index: number, patch: Partial<MaterialRowDraft>) => {
    update({
      materialRows: draft.materialRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  };

  const setOtherCost = (index: number, patch: Partial<OtherCostRowDraft>) => {
    update({
      otherCostRows: draft.otherCostRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  };

  return (
    <Section
      step="Step 3"
      title="What you will buy or pay for"
      note="Everything you pay out for this job that is not crew pay."
    >
      <h3 className="row-card-title" style={{ display: "block", marginBottom: 12 }}>
        {customerLanguage.materialCost.label}
      </h3>
      <p className="section-note" style={{ marginTop: 0 }}>
        {customerLanguage.materialCost.help}
      </p>

      <div className="row-list">
        {draft.materialRows.map((row, index) => (
          <div className="row-card" key={row.id}>
            <div className="row-card-head">
              <span className="row-card-title">Material {index + 1}</span>
              {draft.materialRows.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-remove"
                  onClick={() =>
                    update({ materialRows: draft.materialRows.filter((_, i) => i !== index) })
                  }
                >
                  Remove<span className="visually-hidden"> material {index + 1}</span>
                </button>
              ) : null}
            </div>
            <div className="row-grid material">
              <TextField
                label="What you are buying"
                value={row.description}
                onChange={(value) => setMaterial(index, { description: value })}
                placeholder="Lumber package"
              />
              <NumberField
                label="How many"
                value={row.quantity}
                onChange={(value) => setMaterial(index, { quantity: value })}
                error={errors.get(`materialItems.${index}.quantity`)}
              />
              <NumberField
                label="Cost each"
                prefix="$"
                value={row.unitCost}
                onChange={(value) => setMaterial(index, { unitCost: value })}
                placeholder="2000"
                error={errors.get(`materialItems.${index}.unitCost`)}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-add"
        onClick={() => update({ materialRows: [...draft.materialRows, createMaterialRow()] })}
      >
        + Add another material
      </button>

      <h3 className="row-card-title" style={{ display: "block", margin: "32px 0 12px" }}>
        {customerLanguage.otherJobCosts.label}
      </h3>
      <p className="section-note" style={{ marginTop: 0 }}>
        {customerLanguage.otherJobCosts.help}
      </p>

      {draft.otherCostRows.length === 0 ? (
        <p className="help" style={{ color: "var(--ink-faint)" }}>
          Nothing added yet. Add a line if this job has permits, a rental, a subcontractor, delivery,
          or disposal.
        </p>
      ) : (
        <div className="row-list">
          {draft.otherCostRows.map((row, index) => (
            <div className="row-card" key={row.id}>
              <div className="row-card-head">
                <span className="row-card-title">Other cost {index + 1}</span>
                <button
                  type="button"
                  className="btn btn-remove"
                  onClick={() =>
                    update({ otherCostRows: draft.otherCostRows.filter((_, i) => i !== index) })
                  }
                >
                  Remove<span className="visually-hidden"> other cost {index + 1}</span>
                </button>
              </div>
              <div className="row-grid other-cost">
                <TextField
                  label="What it is for"
                  value={row.description}
                  onChange={(value) => setOtherCost(index, { description: value })}
                  placeholder="City permit"
                />
                <SelectField
                  label="Kind of cost"
                  value={row.category}
                  onChange={(value) =>
                    setOtherCost(index, { category: value as OtherJobCostCategory })
                  }
                  options={otherJobCostCategories}
                />
                <NumberField
                  label="Amount"
                  prefix="$"
                  value={row.amount}
                  onChange={(value) => setOtherCost(index, { amount: value })}
                  placeholder="250"
                  error={errors.get(`otherJobCostItems.${index}.amount`)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-add"
        onClick={() => update({ otherCostRows: [...draft.otherCostRows, createOtherCostRow()] })}
      >
        + Add another job cost
      </button>
    </Section>
  );
}
