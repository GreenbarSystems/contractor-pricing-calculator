import { PricingCalculator } from "../components/PricingCalculator.js";

export default function HomePage() {
  return (
    <main className="page">
      <header className="masthead">
        <span className="eyebrow">Contractor job pricing</span>
        <h1>What should I charge?</h1>
        <p className="lede">
          Put in what this job will cost you and how much profit you want to keep. You will get a
          price you can quote with confidence, in plain language, with no accounting background
          needed.
        </p>
        <p className="no-account">Free to use. No account, no sign-up, nothing to install.</p>
      </header>

      <PricingCalculator />
    </main>
  );
}
