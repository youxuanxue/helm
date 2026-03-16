import { apiPost } from "../lib/client";

export async function cmdApprove(approvalId: string): Promise<void> {
  await apiPost(`/approvals/${approvalId}/approve`, {});
  console.log("Approved.");
}
