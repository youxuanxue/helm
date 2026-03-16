const API_URL = import.meta.env.VITE_API_URL ?? "";

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

const API = "/api";

export const api = {
  companies: {
    list: () =>
      fetchApi<{ id: string; name: string; mission: string; status: string }[]>(`${API}/companies`),
    get: (id: string) => fetchApi<object>(`${API}/companies/${id}`),
    issues: (id: string) =>
      fetchApi<{ id: string; title: string; description?: string; status: string }[]>(
        `${API}/companies/${id}/issues`
      ),
    create: (body: {
      name: string;
      mission: string;
      target_audience: string;
      template_id?: string;
      company_spec?: object;
    }) => fetchApi<object>(`${API}/companies`, { method: "POST", body: JSON.stringify(body) }),
  },
  demands: {
    create: (companyId: string, body: { demand: string }) =>
      fetchApi<object>(`${API}/companies/${companyId}/demands`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  approvals: {
    list: (companyId: string) =>
      fetchApi<{ id: string; type: string; status: string; payload: object }[]>(
        `${API}/companies/${companyId}/approvals`
      ),
    get: (id: string) => fetchApi<object>(`${API}/approvals/${id}`),
    approve: (id: string) =>
      fetchApi<object>(`${API}/approvals/${id}/approve`, { method: "POST" }),
    reject: (id: string) =>
      fetchApi<object>(`${API}/approvals/${id}/reject`, { method: "POST" }),
  },
  templates: {
    list: () => fetchApi<{ id: string; name: string }[]>(`${API}/templates`),
  },
};
