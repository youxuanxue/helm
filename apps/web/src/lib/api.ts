const API_URL =
  ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_URL ?? "");

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export const api = {
  companies: {
    list: () =>
      fetchApi<{ id: string; name: string; mission: string; status: string }[]>(`/companies`),
    get: (id: string) => fetchApi<object>(`/companies/${id}`),
    issues: (id: string) =>
      fetchApi<{ id: string; title: string; description?: string; status: string }[]>(
        `/companies/${id}/issues`
      ),
    create: (body: {
      name?: string;
      mission?: string;
      target_audience?: string;
      template_id?: string;
      company_spec?: object;
    }) => fetchApi<object>(`/companies`, { method: "POST", body: JSON.stringify(body) }),
    costs: (id: string) =>
      fetchApi<{
        total_cost_cents: number;
        total_input_tokens: number;
        total_output_tokens: number;
        events: number;
        budget_cents: number | null;
        company_status: string;
        over_budget: boolean;
        by_billing_code?: Array<{ billing_code: string; cost_cents: number }>;
      }>(`/companies/${id}/costs`),
    budget: (id: string, amountCents: number) =>
      fetchApi<object>(`/companies/${id}/budget`, {
        method: "PATCH",
        body: JSON.stringify({ amount_cents: amountCents }),
      }),
    heartbeat: (id: string) =>
      fetchApi<{
        run_id: string;
        status: "succeed" | "failed";
        scheduled_node_ids: string[];
        node_state_summary: {
          pending: number;
          running: number;
          succeed: number;
          failed: number;
          cancelled: number;
          timeout: number;
        };
      }>(`/companies/${id}/heartbeat`, { method: "POST" }),
    heartbeatLoopStatus: (id: string) =>
      fetchApi<{
        active: boolean;
        interval_ms: number | null;
        is_running_cycle: boolean;
      }>(`/companies/${id}/heartbeat/status`),
    startHeartbeatLoop: (id: string, intervalMs = 5000) =>
      fetchApi<{ started: boolean; interval_ms: number }>(`/companies/${id}/heartbeat/start`, {
        method: "POST",
        body: JSON.stringify({ interval_ms: intervalMs }),
      }),
    stopHeartbeatLoop: (id: string) =>
      fetchApi<{ stopped: boolean }>(`/companies/${id}/heartbeat/stop`, { method: "POST" }),
    actionNodes: (id: string) =>
      fetchApi<
        Array<{
          id: string;
          issue_id: string | null;
          spec_ref: string;
          depends_on: string;
          status: string;
          heartbeat_run_id: string | null;
          updated_at: string;
          issue_title?: string | null;
          retry_count?: number;
          max_retries?: number;
          last_error?: string | null;
        }>
      >(`/companies/${id}/action-nodes`),
  },
  demands: {
    create: (companyId: string, body: { demand: string }) =>
      fetchApi<object>(`/companies/${companyId}/demands`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  approvals: {
    list: (companyId: string) =>
      fetchApi<{ id: string; type: string; status: string; payload: object }[]>(
        `/companies/${companyId}/approvals`
      ),
    get: (id: string) => fetchApi<object>(`/approvals/${id}`),
    approve: (id: string) =>
      fetchApi<object>(`/approvals/${id}/approve`, { method: "POST" }),
    reject: (id: string) =>
      fetchApi<object>(`/approvals/${id}/reject`, { method: "POST" }),
  },
  templates: {
    list: () => fetchApi<{ id: string; name: string }[]>(`/templates`),
    get: (id: string) => fetchApi<{ id: string; content: string }>(`/templates/${id}`),
  },
  actionNodes: {
    pause: (id: string) => fetchApi<object>(`/action-nodes/${id}/pause`, { method: "POST" }),
    resume: (id: string) => fetchApi<object>(`/action-nodes/${id}/resume`, { method: "POST" }),
  },
};
