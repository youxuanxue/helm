import { apiGet } from "../lib/client";

export async function cmdStatus(companyId: string): Promise<void> {
  const [company, issues, approvals] = await Promise.all([
    apiGet<{ name: string; status: string }>(`/companies/${companyId}`),
    apiGet<unknown[]>(`/companies/${companyId}/issues`),
    apiGet<unknown[]>(`/companies/${companyId}/approvals`),
  ]);
  console.log(`Company: ${(company as { name?: string }).name} (${(company as { status?: string }).status})`);
  console.log(`Issues: ${(issues as unknown[]).length}`);
  console.log(`Pending approvals: ${(approvals as unknown[]).filter((a: { status?: string }) => a.status === "pending").length}`);
}
