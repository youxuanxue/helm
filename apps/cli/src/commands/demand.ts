import { apiPost } from "../lib/client";
import { validateSafeId } from "@helm/shared";

export async function cmdDemand(companyId: string, text: string): Promise<void> {
  validateSafeId(companyId, "company-id");
  const result = await apiPost<{ id: string; title?: string }>(
    `/companies/${companyId}/demands`,
    { demand: text }
  );
  console.log(`Demand submitted. Issue ID: ${(result as { id?: string }).id}`);
}
