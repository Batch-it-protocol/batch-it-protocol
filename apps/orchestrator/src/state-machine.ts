/**
 * Crash-safe orchestrator stages. On resume: read chain first, then this file.
 *
 * Partial landing:
 * - Launching + no curve → create+buy bundle
 * - Launching + curve exists + not Bought → buy-only bundle
 * - grace expired → wait refund (do not rescue orphan mint)
 */

export type Stage =
  | "idle"
  | "waiting_launch_at"
  | "begin_launch_sent"
  | "building_bundle"
  | "bundle_submitted"
  | "confirming"
  | "bought"
  | "finalized"
  | "failed"
  | "refund_window";

export type LaunchState = {
  pool: string;
  mint: string;
  stage: Stage;
  lastBundleId?: string;
  lastError?: string;
  updatedAt: string;
  /** Production path only uses Jito unless allowSequentialRpc */
  submissionMode: "jito" | "sequential_debug";
};

export function nextStageFromChain(input: {
  poolStatus: string;
  curveExists: boolean;
  now: number;
  graceEndsAt: number;
}): Stage {
  const { poolStatus, curveExists, now, graceEndsAt } = input;
  if (poolStatus === "Finalized") return "finalized";
  if (poolStatus === "Bought") return "bought";
  if (poolStatus === "Refundable") return "refund_window";
  if (poolStatus === "Launching") {
    if (now >= graceEndsAt) return "refund_window";
    return curveExists ? "building_bundle" : "building_bundle";
  }
  if (poolStatus === "Open") {
    return now >= graceEndsAt ? "refund_window" : "waiting_launch_at";
  }
  return "idle";
}

export function bundleKind(input: {
  poolStatus: string;
  curveExists: boolean;
}): "create_and_buy" | "buy_only" | "none" {
  if (input.poolStatus !== "Launching") return "none";
  return input.curveExists ? "buy_only" : "create_and_buy";
}
