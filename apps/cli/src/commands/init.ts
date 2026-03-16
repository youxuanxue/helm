import { apiPost } from "../lib/client";

export async function cmdInit(opts: {
  template?: string;
  name?: string;
  mission?: string;
  targetAudience?: string;
}): Promise<void> {
  let body: Record<string, unknown>;
  if (opts.template) {
    body = { template_id: opts.template };
  } else {
    if (!opts.name || !opts.mission || !opts.targetAudience) {
      console.error("Usage: helm init --name <name> --mission <mission> --target-audience <audience>");
      process.exit(1);
    }
    body = {
      name: opts.name,
      mission: opts.mission,
      target_audience: opts.targetAudience,
    };
  }
  const result = await apiPost<{ id: string; name: string }>("/companies", body);
  console.log(`Company "${(result as { name?: string }).name}" created. ID: ${(result as { id?: string }).id}`);
}
