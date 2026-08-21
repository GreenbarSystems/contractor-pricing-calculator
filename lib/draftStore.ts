import { reviveDraft } from "./calculatorState.js";
import {
  reviveBusinessProfile,
  reviveJobDraft,
  splitDraft,
  type BusinessProfile,
  type JobDraft,
} from "./draftModel.js";

export const BUSINESS_STORAGE_KEY = "contractor-pricing-calculator:business:v1";
export const JOB_STORAGE_KEY = "contractor-pricing-calculator:job:v1";
export const LEGACY_DRAFT_STORAGE_KEY = "contractor-pricing-calculator:draft:v1";

const canUseStorage = (): boolean => typeof window !== "undefined";

function readRaw(key: string): string | null {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A full or blocked storage quota must never break the calculator.
  }
}

function removeRaw(key: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignored for the same reason as saveDraft.
  }
}

/**
 * If the split keys are empty, copy :draft:v1 into them once. The legacy key
 * is left in place — the existing sync load/save/clear still owns it — and
 * start-over must not read it again after a job has been cleared.
 */
function migrateLegacyDraftOnce(): void {
  if (!canUseStorage()) return;
  if (readRaw(BUSINESS_STORAGE_KEY) !== null || readRaw(JOB_STORAGE_KEY) !== null) {
    return;
  }

  const raw = readRaw(LEGACY_DRAFT_STORAGE_KEY);
  if (!raw) return;

  try {
    const draft = reviveDraft(JSON.parse(raw));
    if (!draft) return;
    const { profile, job } = splitDraft(draft);
    writeRaw(BUSINESS_STORAGE_KEY, JSON.stringify(profile));
    writeRaw(JOB_STORAGE_KEY, JSON.stringify(job));
  } catch {
    // A broken legacy blob is treated as "nothing stored".
  }
}

async function loadBusiness(): Promise<BusinessProfile | null> {
  migrateLegacyDraftOnce();
  const raw = readRaw(BUSINESS_STORAGE_KEY);
  if (!raw) return null;
  try {
    return reviveBusinessProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function saveBusiness(profile: BusinessProfile): Promise<void> {
  writeRaw(BUSINESS_STORAGE_KEY, JSON.stringify(profile));
}

async function loadJob(): Promise<JobDraft | null> {
  migrateLegacyDraftOnce();
  const raw = readRaw(JOB_STORAGE_KEY);
  if (!raw) return null;
  try {
    return reviveJobDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function saveJob(job: JobDraft): Promise<void> {
  writeRaw(JOB_STORAGE_KEY, JSON.stringify(job));
}

/** Clears the current job only. The business profile stays put. */
async function clearJob(): Promise<void> {
  removeRaw(JOB_STORAGE_KEY);
}

export const DraftStore = {
  loadBusiness,
  saveBusiness,
  loadJob,
  saveJob,
  clearJob,
};
