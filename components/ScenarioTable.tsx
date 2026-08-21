"use client";

import {
  calculateJobPrice,
  formatCurrency,
  formatPercent,
  type JobPricingInput,
  type JobPricingResult,
  type ProposedPriceStatus,
} from "../src/pricing/index.js";

const SCENARIO_STEP = 500;

const statusTag: Record<ProposedPriceStatus, { className: string; label: string }> = {
  "below-cost": { className: "tag-bad", label: "Loses money" },
  "below-target": { className: "tag-warn", label: "Under goal" },
  "meets-target": { className: "tag-good", label: "Meets goal" },
  "not-entered": { className: "tag-warn", label: "—" },
};

interface Props {
  input: JobPricingInput;
  result: JobPricingResult;
}

/**
 * Answers "what if I shade the price a little?" by running the same engine at
 * the recommended price and at $500 either side of it.
 */
export function ScenarioTable({ input, result }: Props) {
  const prices = [
    result.recommendedPrice - SCENARIO_STEP,
    result.recommendedPrice,
    result.recommendedPrice + SCENARIO_STEP,
  ].map((price) => Math.max(0, price));

  const rows = prices.map((price, index) => {
    const scenario = calculateJobPrice({ ...input, proposedPrice: price });
    return {
      key: index,
      isRecommended: index === 1,
      label:
        index === 1
          ? "Recommended price"
          : `${index === 0 ? "−" : "+"}${formatCurrency(SCENARIO_STEP).replace(".00", "")}`,
      price,
      profit: scenario.proposedProfit ?? 0,
      profitRate: scenario.proposedProfitRate ?? 0,
      status: scenario.proposedPriceStatus,
    };
  });

  return (
    <div className="scenarios">
      <h3>What if you charge a little more or less?</h3>
      <div className="table-scroll">
        <table className="scenario-table">
          <caption className="visually-hidden">
            Profit you would keep at the recommended price and at $500 above and below it.
          </caption>
          <thead>
            <tr>
              <th scope="col">Price</th>
              <th scope="col">You charge</th>
              <th scope="col">You keep</th>
              <th scope="col">Share you keep</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tag = statusTag[row.status];
              return (
                <tr key={row.key} className={row.isRecommended ? "is-recommended" : undefined}>
                  <th scope="row">{row.label}</th>
                  <td>{formatCurrency(row.price)}</td>
                  <td>{formatCurrency(row.profit)}</td>
                  <td>{formatPercent(row.profitRate)}</td>
                  <td>
                    <span className={`scenario-tag ${tag.className}`}>{tag.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
