import { apiGet } from "../lib/client";
import { validateSafeId } from "@helm/shared";

export async function cmdStatus(companyId: string): Promise<void> {
  validateSafeId(companyId, "company-id");
  const [company, issues, approvals, nodes, agentCosts] = await Promise.all([
    apiGet<{ name: string; status: string }>(`/companies/${companyId}`),
    apiGet<unknown[]>(`/companies/${companyId}/issues`),
    apiGet<Array<{ status?: string }>>(`/companies/${companyId}/approvals`),
    apiGet<Array<{ status?: string; last_error?: string | null }>>(`/companies/${companyId}/action-nodes`),
    apiGet<Array<{ name: string; total_cost_cents: number; over_budget: boolean; status: string }>>(
      `/companies/${companyId}/costs/agents`,
    ),
  ]);
  const blockedNodes = nodes.filter(
    (node) => node.status === "failed" || node.status === "timeout" || node.last_error?.includes("budget"),
  ).length;
  const topAgents = agentCosts.slice(0, 3);
  console.log(`Company: ${(company as { name?: string }).name} (${(company as { status?: string }).status})`);
  console.log(`Issues: ${issues.length}`);
  console.log(`Pending approvals: ${approvals.filter((a) => a.status === "pending").length}`);
  console.log(`Blocked nodes: ${blockedNodes}`);
  if (topAgents.length > 0) {
    console.log("Top agent cost:");
    for (const item of topAgents) {
      console.log(
        `- ${item.name}: ${item.total_cost_cents} cents (${item.status}${item.over_budget ? ", over budget" : ""})`,
      );
    }
  }
}
