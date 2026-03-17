import { apiPatch } from "../lib/client";
import { validateSafeId } from "@helm/shared";

export async function cmdBudget(companyId: string, amountCents: number): Promise<void> {
  validateSafeId(companyId, "company-id");
  await apiPatch(`/companies/${companyId}/budget`, { amount_cents: amountCents });
  console.log(`Budget set to ${amountCents} cents.`);
}
