import { apiPost } from "../lib/client";

export async function cmdDemand(companyId: string, text: string): Promise<void> {
  const result = await apiPost<{ id: string; title?: string }>(
    `/companies/${companyId}/demands`,
    { demand: text }
  );
  console.log(`Demand submitted. Issue ID: ${(result as { id?: string }).id}`);
}
