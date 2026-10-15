import { PlaneShell, type Payload } from "../components/PlaneShell";
import { PricingCalculator } from "../components/PricingCalculator";

export const dynamic = "force-dynamic";

async function readPlane(): Promise<Payload | null> {
  try {
    const res = await fetch(`${process.env.PLANE_URL ?? "http://127.0.0.1:43188"}/api/view`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Payload;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const initial = await readPlane();
  return (
    <PlaneShell initial={initial}>
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
    </PlaneShell>
  );
}
