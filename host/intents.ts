import type { Intent, VersionId } from "control-plane"

export function restoreIntent(to: string): Intent {
  return { kind: "goBack", to: to as VersionId }
}
