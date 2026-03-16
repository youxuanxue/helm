import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";

interface Issue {
  id: string;
  title: string;
  description?: string;
  status: string;
}

interface Approval {
  id: string;
  type: string;
  status: string;
  payload: object;
}

export function Dashboard() {
  const { id } = useParams<{ id: string }>();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);

  useEffect(() => {
    if (id) {
      api.companies.issues(id).then(setIssues);
      api.approvals.list(id).then(setApprovals);
    }
  }, [id]);

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const inProgress = issues.filter((i) => i.status === "in_progress" || i.status === "todo");

  return (
    <div className="space-y-8">
      <Link to={`/company/${id}`} className="inline-block text-sm text-helm-accent hover:underline">
        ← 返回公司
      </Link>
      <h1 className="text-xl font-semibold text-helm-fg">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-helm-border bg-helm-surface p-4">
          <h2 className="text-sm font-medium text-helm-muted">待决策</h2>
          <p className="mt-2 text-2xl font-semibold text-helm-accent">{pendingApprovals.length}</p>
          {pendingApprovals.slice(0, 3).map((a) => (
            <Link
              key={a.id}
              to={`/company/${id}/approval/${a.id}`}
              className="mt-2 block text-sm text-helm-fg hover:underline"
            >
              {a.type} #{a.id.slice(0, 8)}
            </Link>
          ))}
        </div>
        <div className="rounded-lg border border-helm-border bg-helm-surface p-4">
          <h2 className="text-sm font-medium text-helm-muted">进行中</h2>
          <p className="mt-2 text-2xl font-semibold text-helm-success">{inProgress.length}</p>
          {inProgress.slice(0, 3).map((i) => (
            <div key={i.id} className="mt-2 text-sm text-helm-fg">
              {i.title}
            </div>
          ))}
        </div>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-medium text-helm-fg">任务列表</h2>
        <div className="space-y-2">
          {issues.map((i) => (
            <div
              key={i.id}
              className="rounded-lg border border-helm-border bg-helm-surface px-4 py-3"
            >
              <span className="font-medium text-helm-fg">{i.title}</span>
              <span className="ml-2 rounded bg-helm-muted/20 px-2 py-0.5 text-xs text-helm-muted">
                {i.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
