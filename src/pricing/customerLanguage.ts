import type { ProposedPriceStatus } from "./types.js";

export const customerLanguage = {
  laborPay: {
    label: "Labor pay",
    help: "What you expect to pay your crew for this job.",
  },
  extraWageCosts: {
    label: "Extra cost on top of wages",
    help: "Employer costs such as payroll taxes, workers' comp, paid time off, benefits, and similar costs.",
  },
  materialCost: {
    label: "Your material cost",
    help: "What you expect to pay suppliers for materials used on this job.",
  },
  otherJobCosts: {
    label: "Other job costs",
    help: "Use this for permits, rentals, subcontractors, delivery, disposal, and other job-specific costs.",
  },
  businessCosts: {
    label: "Business costs for this job",
    help: "A share of the cost of running your business, such as trucks, insurance, software, office costs, and advertising.",
  },
  annualSellableHours: {
    label: "Hours you expect to sell this year",
    help: "Customer work hours you expect to charge for this year. Do not count every paid hour if it cannot be billed to a customer.",
  },
  costRecoveryPrice: {
    label: "Lowest price that covers these costs",
    help: "The minimum price needed to recover the costs included in this calculation. It does not include profit.",
  },
  recommendedPrice: {
    label: "Recommended price to charge",
    help: "The price that covers the costs you entered and leaves the profit you selected.",
  },
  targetProfit: {
    label: "Profit you want to keep",
    help: "The part of the customer's payment you want left after the job costs you entered are paid.",
  },
  proposedPrice: {
    label: "Your quoted price",
    help: "Optional: enter the price you are thinking of charging to see how it compares.",
  },
} as const;

export const proposedPriceMessages: Record<ProposedPriceStatus, { title: string; detail: string }> = {
  "below-cost": {
    title: "This price does not cover the costs you entered.",
    detail: "You would lose money on this job based on this calculation.",
  },
  "below-target": {
    title: "This price covers your costs but misses your profit goal.",
    detail: "You may want to raise the price or review the costs and hours you entered.",
  },
  "meets-target": {
    title: "This price meets or beats your profit goal.",
    detail: "It covers the costs you entered and reaches your selected profit target.",
  },
  "not-entered": {
    title: "Enter a quoted price to compare it.",
    detail: "You will see whether it covers your costs and reaches your profit goal.",
  },
};

export const pricingEstimateDisclosure =
  "This is a pricing estimate based on the numbers you entered. It helps you price a job, but it does not replace your accounting records or professional advice.";
