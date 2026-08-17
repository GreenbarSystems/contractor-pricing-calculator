"use client";

import { ScenarioTable } from "./ScenarioTable.js";
import {
  customerLanguage,
  formatCurrency,
  formatPercent,
  pricingEstimateDisclosure,
  proposedPriceMessages,
  type JobPricingInput,
  type JobPricingResult,
  type ProposedPriceStatus,
  type ValidationIssue,
} from "../src/pricing/index.js";

const statusClass: Record<ProposedPriceStatus, string> = {
  "below-cost": "status-bad",
  "below-target": "status-warn",
  "meets-target": "status-good",
  "not-entered": "status-neutral",
};

interface Props {
  input: JobPricingInput;
  result: JobPricingResult | null;
  issues: ValidationIssue[];
}

export function ResultsPanel({ input, result, issues }: Props) {
  if (!result) {
    return (
      <div className="results blocked">
        <h2>A few numbers need a second look</h2>
        <p>Fix these and your recommended price will appear here right away.</p>
        <ul>
          {issues.map((issue) => (
            <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
        <p className="legal-note">{pricingEstimateDisclosure}</p>
      </div>
    );
  }

  // Nothing costed yet. "$0.00" is technically right and useless to look at.
  if (result.totalJobCost === 0) {
    return (
      <div className="results blocked">
        <h2>Your price shows up here</h2>
        <p>
          Start with what you pay your crew — an hourly rate and the hours you expect the job to
          take. The price updates as you type, and nothing is saved anywhere but this browser.
        </p>
        <p className="legal-note">{pricingEstimateDisclosure}</p>
      </div>
    );
  }

  const status = proposedPriceMessages[result.proposedPriceStatus];

  const breakdown: { name: string; amount: number }[] = [
    { name: customerLanguage.laborPay.label, amount: result.laborPay },
    { name: customerLanguage.extraWageCosts.label, amount: result.extraWageCosts },
    { name: customerLanguage.materialCost.label, amount: result.materialCost },
    { name: customerLanguage.otherJobCosts.label, amount: result.otherJobCosts },
    { name: customerLanguage.businessCosts.label, amount: result.businessCostsForJob },
  ];

  return (
    <div className="results">
      <div className="headline-price">
        <p className="label">{customerLanguage.recommendedPrice.label}</p>
        <p className="amount">{formatCurrency(result.recommendedPrice)}</p>
        <p className="explain">
          This covers the costs you entered and leaves your chosen profit on the job.
        </p>
      </div>

      <div className="result-pair">
        <div className="result-block">
          <p className="label">{customerLanguage.costRecoveryPrice.label}</p>
          <p className="value">{formatCurrency(result.costRecoveryPrice)}</p>
          <p className="sub">Charge less than this and you pay for part of the job yourself.</p>
        </div>
        <div className="result-block">
          <p className="label">{customerLanguage.targetProfit.label}</p>
          <p className="value">{formatCurrency(result.targetProfit)}</p>
          <p className="sub">
            {formatPercent(result.targetProfitRate)} of the recommended price
          </p>
        </div>
      </div>

      <div className={`status-card ${statusClass[result.proposedPriceStatus]}`} role="status">
        <p className="status-title">{status.title}</p>
        <p className="status-detail">{status.detail}</p>
        {result.proposedPrice !== undefined && result.proposedProfit !== undefined ? (
          <p className="status-detail">
            At {formatCurrency(result.proposedPrice)} you keep{" "}
            <strong>{formatCurrency(result.proposedProfit)}</strong>
            {result.proposedProfitRate !== undefined
              ? ` (${formatPercent(result.proposedProfitRate)} of the price)`
              : null}
            .
          </p>
        ) : null}
      </div>

      <div className="breakdown">
        <h3>Where the money goes</h3>
        <ul className="breakdown-list">
          {breakdown.map((line) => (
            <li key={line.name}>
              <span className="name">{line.name}</span>
              <span className="amount">{formatCurrency(line.amount)}</span>
            </li>
          ))}
          <li className="total">
            <span className="name">Total cost of this job</span>
            <span className="amount">{formatCurrency(result.totalJobCost)}</span>
          </li>
        </ul>
        {result.laborHours > 0 ? (
          <p className="sub" style={{ marginTop: 12, color: "var(--ink-faint)", fontSize: "0.86rem" }}>
            Based on {result.laborHours.toLocaleString("en-US")} crew hours
            {result.businessCostPerHour > 0
              ? ` and ${formatCurrency(result.businessCostPerHour)} of business costs per hour`
              : ""}
            .
          </p>
        ) : null}
      </div>

      <ScenarioTable input={input} result={result} />

      {result.warnings.length > 0 ? (
        <div className="warnings">
          <h3>Worth knowing</h3>
          <ul className="warning-list">
            {result.warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="legal-note">{pricingEstimateDisclosure}</p>
    </div>
  );
}
