import { apiPatch } from "../lib/client";

export async function cmdBudget(companyId: string, amountCents: number): Promise<void> {
  await apiPatch(`/companies/${companyId}/budget`, { amount_cents: amountCents });
  console.log(`Budget set to ${amountCents} cents.`);
}
