import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyDraft,
  draftToPricingInput,
  type CalculatorDraft,
} from "../../lib/calculatorState.js";
import {
  compose,
  createEmptyBusinessProfile,
  createEmptyJobDraft,
  splitDraft,
  splitRevivedDraft,
  type BusinessProfile,
  type JobDraft,
} from "../../lib/draftModel.js";
import {
  BUSINESS_STORAGE_KEY,
  DraftStore,
  JOB_STORAGE_KEY,
  LEGACY_DRAFT_STORAGE_KEY,
} from "../../lib/draftStore.js";
import { calculateJobPrice } from "../../src/pricing/index.js";

const filledDraft = (): CalculatorDraft => ({
  ...createEmptyDraft(),
  jobName: "Kitchen remodel - Smith",
  laborRows: [
    {
      id: "crew-1",
      hourlyWage: "25",
      workers: "2",
      regularHours: "40",
      overtimeHours: "",
      overtimeMultiplier: "1.5",
    },
  ],
  extraWageCostPercent: "28",
  materialRows: [{ id: "material-1", quantity: "1", unitCost: "2000" }],
  otherCostRows: [{ id: "other-1", description: "Permit", amount: "250" }],
  annualBusinessCosts: "75000",
  annualSellableHours: "4000",
  targetProfitPercent: "20",
});

const filledProfile = (): BusinessProfile => ({
  annualBusinessCosts: "75000",
  annualSellableHours: "4000",
  extraWageCostPercent: "28",
  crewRates: [{ id: "rate-carpenter", hourlyWage: "25", label: "Carpenter" }],
});

const filledJob = (): JobDraft => ({
  jobName: "Kitchen remodel - Smith",
  laborRows: [
    {
      id: "crew-1",
      rateId: "rate-carpenter",
      workers: "2",
      regularHours: "40",
      overtimeHours: "",
      overtimeMultiplier: "1.5",
    },
  ],
  materialRows: [{ id: "material-1", quantity: "1", unitCost: "2000" }],
  otherCostRows: [{ id: "other-1", description: "Permit", amount: "250" }],
  manualJobHours: "",
  targetProfitPercent: "20",
  proposedPrice: "",
});

class MemoryStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

function installStorage(storage: MemoryStorage = new MemoryStorage()): MemoryStorage {
  vi.stubGlobal("window", { localStorage: storage });
  return storage;
}

beforeEach(() => {
  installStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compose", () => {
  it("produces the same JobPricingInput as today's draft ($6,310 @ 20% → $7,887.50)", () => {
    const composed = compose(filledProfile(), filledJob());
    const fromCompose = draftToPricingInput(composed);
    const fromToday = draftToPricingInput(filledDraft());
    const result = calculateJobPrice(fromCompose);

    expect(fromCompose).toEqual(fromToday);
    expect(result.totalJobCost).toBe(6310);
    expect(result.recommendedPrice).toBe(7887.5);
  });

  it("copies shop fields and extra-wage from the profile", () => {
    const composed = compose(filledProfile(), filledJob());

    expect(composed.annualBusinessCosts).toBe("75000");
    expect(composed.annualSellableHours).toBe("4000");
    expect(composed.extraWageCostPercent).toBe("28");
    expect(composed.laborRows[0]!.hourlyWage).toBe("25");
    expect(composed.laborRows[0]!).not.toHaveProperty("rateId");
  });

  it("writes a blank wage when the row's rate is missing", () => {
    const job = filledJob();
    job.laborRows[0] = { ...job.laborRows[0]!, rateId: "rate-gone" };

    expect(compose(filledProfile(), job).laborRows[0]!.hourlyWage).toBe("");
  });
});

describe("splitDraft", () => {
  it("promotes each distinct stored wage into crewRates and points rows at them", () => {
    const draft = filledDraft();
    draft.laborRows = [
      { ...draft.laborRows[0]!, id: "crew-1", hourlyWage: "25" },
      { ...draft.laborRows[0]!, id: "crew-2", hourlyWage: "40" },
      { ...draft.laborRows[0]!, id: "crew-3", hourlyWage: "25" },
    ];

    const { profile, job } = splitDraft(draft);

    expect(profile.crewRates).toHaveLength(2);
    expect(profile.crewRates.map((rate) => rate.hourlyWage)).toEqual(["25", "40"]);
    expect(job.laborRows[0]!).not.toHaveProperty("hourlyWage");
    expect(job.laborRows[0]!.rateId).toBe(profile.crewRates[0]!.id);
    expect(job.laborRows[1]!.rateId).toBe(profile.crewRates[1]!.id);
    expect(job.laborRows[2]!.rateId).toBe(profile.crewRates[0]!.id);
    expect(compose(profile, job).laborRows.map((row) => row.hourlyWage)).toEqual(["25", "40", "25"]);
  });

  it("does not drop a stored wage, including a blank one", () => {
    const draft = filledDraft();
    draft.laborRows = [
      { ...draft.laborRows[0]!, id: "crew-1", hourlyWage: "" },
      { ...draft.laborRows[0]!, id: "crew-2", hourlyWage: "32.50" },
    ];

    const { profile, job } = splitDraft(draft);

    expect(profile.crewRates.map((rate) => rate.hourlyWage)).toEqual(["", "32.50"]);
    expect(compose(profile, job).laborRows.map((row) => row.hourlyWage)).toEqual(["", "32.50"]);
  });
});

describe("revive-from-v1", () => {
  it("splits :draft:v1 once into profile and job", async () => {
    const storage = installStorage();
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify(filledDraft()));

    const profile = await DraftStore.loadBusiness();
    const job = await DraftStore.loadJob();

    expect(profile?.extraWageCostPercent).toBe("28");
    expect(profile?.annualBusinessCosts).toBe("75000");
    expect(profile?.crewRates.map((rate) => rate.hourlyWage)).toEqual(["25"]);
    expect(job?.jobName).toBe("Kitchen remodel - Smith");
    expect(job?.laborRows[0]!.rateId).toBe(profile?.crewRates[0]!.id);
    expect(job?.laborRows[0]!).not.toHaveProperty("hourlyWage");

    const result = calculateJobPrice(draftToPricingInput(compose(profile!, job!)));
    expect(result.totalJobCost).toBe(6310);
    expect(result.recommendedPrice).toBe(7887.5);

    expect(storage.getItem(BUSINESS_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(JOB_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(LEGACY_DRAFT_STORAGE_KEY)).not.toBeNull();
  });

  it("does not split a second time after the new keys exist", async () => {
    const storage = installStorage();
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify(filledDraft()));

    await DraftStore.loadBusiness();

    const changed: CalculatorDraft = { ...filledDraft(), jobName: "Should be ignored", extraWageCostPercent: "99" };
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify(changed));

    const profile = await DraftStore.loadBusiness();
    const job = await DraftStore.loadJob();

    expect(job?.jobName).toBe("Kitchen remodel - Smith");
    expect(profile?.extraWageCostPercent).toBe("28");
  });

  it("repairs a raw older draft before splitting", () => {
    const split = splitRevivedDraft({
      jobName: "Old job",
      laborRows: [{ id: "crew-9", description: "Carpenter", hourlyWage: "40", regularHours: "8" }],
      extraWageCostPercent: "28",
    });

    expect(split?.profile.crewRates[0]!.hourlyWage).toBe("40");
    expect(split?.job.laborRows[0]!.rateId).toBe(split?.profile.crewRates[0]!.id);
    expect(split?.profile.extraWageCostPercent).toBe("28");
  });
});

describe("clearJob", () => {
  it("does not wipe the business profile", async () => {
    await DraftStore.saveBusiness(filledProfile());
    await DraftStore.saveJob(filledJob());

    await DraftStore.clearJob();

    expect(await DraftStore.loadJob()).toBeNull();
    expect(await DraftStore.loadBusiness()).toEqual(filledProfile());
  });

  it("does not revive the leftover :draft:v1 blob after start-over", async () => {
    const storage = installStorage();
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify(filledDraft()));

    await DraftStore.loadBusiness();
    await DraftStore.clearJob();

    expect(await DraftStore.loadJob()).toBeNull();
    expect(await DraftStore.loadBusiness()).not.toBeNull();
    expect((await DraftStore.loadBusiness())?.annualBusinessCosts).toBe("75000");
  });
});

describe("DraftStore quota and broken storage", () => {
  it("swallows quota errors on save, like saveDraft", async () => {
    const storage = installStorage();
    storage.setItem = () => {
      const error = new Error("The quota has been exceeded.");
      error.name = "QuotaExceededError";
      throw error;
    };

    await expect(DraftStore.saveBusiness(filledProfile())).resolves.toBeUndefined();
    await expect(DraftStore.saveJob(filledJob())).resolves.toBeUndefined();
  });

  it("swallows quota errors on clearJob", async () => {
    const storage = installStorage();
    storage.removeItem = () => {
      throw new Error("The quota has been exceeded.");
    };

    await expect(DraftStore.clearJob()).resolves.toBeUndefined();
  });

  it("returns null when stored JSON cannot be read", async () => {
    const storage = installStorage();
    storage.setItem(BUSINESS_STORAGE_KEY, "{not-json");
    storage.setItem(JOB_STORAGE_KEY, "{not-json");

    expect(await DraftStore.loadBusiness()).toBeNull();
    expect(await DraftStore.loadJob()).toBeNull();
  });
});

describe("empty factories", () => {
  it("defaults extra-wage % on the profile, not the job", () => {
    const profile = createEmptyBusinessProfile();
    const job = createEmptyJobDraft();

    expect(profile.extraWageCostPercent).toBe("28");
    expect(job).not.toHaveProperty("extraWageCostPercent");
    expect(job).not.toHaveProperty("annualBusinessCosts");
    expect(job.laborRows[0]!).toHaveProperty("rateId");
    expect(job.laborRows[0]!).not.toHaveProperty("hourlyWage");
  });
});
