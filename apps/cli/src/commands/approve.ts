import { apiPost } from "../lib/client";
import { validateSafeId } from "@helm/shared";

export async function cmdApprove(approvalId: string): Promise<void> {
  validateSafeId(approvalId, "approval-id");
  await apiPost(`/approvals/${approvalId}/approve`, {});
  console.log("Approved.");
}
