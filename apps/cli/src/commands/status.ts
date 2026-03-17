import { apiGet } from "../lib/client";
import { validateSafeId } from "@helm/shared";

export async function cmdStatus(companyId: string): Promise<void> {
  validateSafeId(companyId, "company-id");
  const [company, issues, approvals] = await Promise.all([
    apiGet<{ name: string; status: string }>(`/companies/${companyId}`),
    apiGet<unknown[]>(`/companies/${companyId}/issues`),
    apiGet<Array<{ status?: string }>>(`/companies/${companyId}/approvals`),
  ]);
  console.log(`Company: ${(company as { name?: string }).name} (${(company as { status?: string }).status})`);
  console.log(`Issues: ${issues.length}`);
  console.log(`Pending approvals: ${approvals.filter((a) => a.status === "pending").length}`);
}
