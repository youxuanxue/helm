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
  const [actionNodes, setActionNodes] = useState<
    Array<{
      id: string;
      spec_ref: string;
      status: string;
      issue_title?: string | null;
      retry_count?: number;
      max_retries?: number;
      last_error?: string | null;
    }>
  >([]);
  const [costs, setCosts] = useState<{
    total_cost_cents: number;
    total_input_tokens: number;
    total_output_tokens: number;
    events: number;
    budget_cents: number | null;
    company_status: string;
    over_budget: boolean;
    by_billing_code?: Array<{ billing_code: string; cost_cents: number }>;
  } | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [heartbeatResult, setHeartbeatResult] = useState<{
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
  } | null>(null);
  const [heartbeatLoop, setHeartbeatLoop] = useState<{
    active: boolean;
    interval_ms: number | null;
    is_running_cycle: boolean;
  } | null>(null);

  useEffect(() => {
    if (id) {
      api.companies.issues(id).then(setIssues);
      api.approvals.list(id).then(setApprovals);
      api.companies.costs(id).then(setCosts);
      api.companies.actionNodes(id).then((rows) =>
        setActionNodes(
          rows.map((row) => ({
            id: row.id,
            spec_ref: row.spec_ref,
            status: row.status,
            issue_title: row.issue_title ?? null,
            retry_count: row.retry_count,
            max_retries: row.max_retries,
            last_error: row.last_error ?? null,
          })),
        ),
      );
      api.companies.heartbeatLoopStatus(id).then(setHeartbeatLoop);
    }
  }, [id]);

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const inProgress = issues.filter((i) => i.status === "in_progress" || i.status === "todo");
  const handleSetBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const amount = parseInt(budgetInput, 10);
    if (!Number.isFinite(amount) || amount < 0) {
      window.alert("请输入非负整数（单位：分）");
      return;
    }
    await api.companies.budget(id, amount);
    window.alert("预算已设置");
    setBudgetInput("");
  };

  const handleHeartbeat = async () => {
    if (!id) return;
    const result = await api.companies.heartbeat(id);
    setHeartbeatResult(result);
    api.companies.issues(id).then(setIssues);
    api.companies.actionNodes(id).then((rows) =>
      setActionNodes(
        rows.map((row) => ({
          id: row.id,
          spec_ref: row.spec_ref,
          status: row.status,
          issue_title: row.issue_title ?? null,
          retry_count: row.retry_count,
          max_retries: row.max_retries,
          last_error: row.last_error ?? null,
        })),
      ),
    );
    window.alert(`Heartbeat ${result.status}，scheduled: ${result.scheduled_node_ids.length}`);
  };

  const handleStartLoop = async () => {
    if (!id) return;
    const started = await api.companies.startHeartbeatLoop(id, 5000);
    setHeartbeatLoop({ active: true, interval_ms: started.interval_ms, is_running_cycle: false });
    window.alert(`Heartbeat loop started (${started.interval_ms}ms)`);
  };

  const handleStopLoop = async () => {
    if (!id) return;
    await api.companies.stopHeartbeatLoop(id);
    setHeartbeatLoop({ active: false, interval_ms: null, is_running_cycle: false });
    window.alert("Heartbeat loop stopped");
  };

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

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-helm-border bg-helm-surface p-4">
          <h2 className="text-sm font-medium text-helm-muted">成本</h2>
          <p className="mt-2 text-2xl font-semibold text-helm-warning">
            {(costs?.total_cost_cents ?? 0).toLocaleString()} cents
          </p>
          <p className="mt-2 text-xs text-helm-muted">
            events: {costs?.events ?? 0} · in: {costs?.total_input_tokens ?? 0} · out: {costs?.total_output_tokens ?? 0}
          </p>
          <p className="mt-1 text-xs text-helm-muted">
            budget: {costs?.budget_cents ?? "unset"} · company: {costs?.company_status ?? "unknown"}
            {costs?.over_budget ? " · OVER BUDGET" : ""}
          </p>
          {costs?.by_billing_code?.[0] && (
            <p className="mt-1 text-xs text-helm-muted">
              top billing: {costs.by_billing_code[0].billing_code} = {costs.by_billing_code[0].cost_cents}
            </p>
          )}
        </div>
        <form
          onSubmit={handleSetBudget}
          className="rounded-lg border border-helm-border bg-helm-surface p-4"
        >
          <h2 className="text-sm font-medium text-helm-muted">预算硬顶</h2>
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              min={0}
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="amount_cents"
              className="w-full rounded border border-helm-border bg-helm-bg px-3 py-2 text-sm text-helm-fg"
            />
            <button type="submit" className="rounded bg-helm-accent px-3 py-2 text-sm text-helm-bg">
              设置
            </button>
          </div>
        </form>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-medium text-helm-fg">任务列表</h2>
          <button
            onClick={handleHeartbeat}
            className="rounded border border-helm-border px-3 py-1 text-sm text-helm-fg hover:bg-helm-surface"
          >
            触发 Heartbeat
          </button>
          <button
            onClick={handleStartLoop}
            className="rounded border border-helm-border px-3 py-1 text-sm text-helm-fg hover:bg-helm-surface"
          >
            启动循环
          </button>
          <button
            onClick={handleStopLoop}
            className="rounded border border-helm-border px-3 py-1 text-sm text-helm-fg hover:bg-helm-surface"
          >
            停止循环
          </button>
          {heartbeatResult && (
            <span className="text-xs text-helm-muted">
              run: {heartbeatResult.run_id.slice(0, 8)} · {heartbeatResult.status} ·
              scheduled {heartbeatResult.scheduled_node_ids.length}
              {" · "}
              states p/r/s/f: {heartbeatResult.node_state_summary.pending}/
              {heartbeatResult.node_state_summary.running}/
              {heartbeatResult.node_state_summary.succeed}/
              {heartbeatResult.node_state_summary.failed}
            </span>
          )}
          {heartbeatLoop && (
            <span className="text-xs text-helm-muted">
              loop: {heartbeatLoop.active ? "active" : "inactive"} · interval:{" "}
              {heartbeatLoop.interval_ms === null ? "n/a" : `${heartbeatLoop.interval_ms}ms`} · running:{" "}
              {heartbeatLoop.is_running_cycle ? "yes" : "no"}
            </span>
          )}
        </div>
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

      <section>
        <h2 className="mb-3 text-lg font-medium text-helm-fg">调度节点</h2>
        <div className="space-y-2">
          {actionNodes.map((node) => (
            <div
              key={node.id}
              className="rounded-lg border border-helm-border bg-helm-surface px-4 py-3 text-sm"
            >
              <span className="text-helm-fg">{node.spec_ref}</span>
              <span className="ml-2 rounded bg-helm-muted/20 px-2 py-0.5 text-xs text-helm-muted">
                {node.status}
              </span>
              {node.issue_title && (
                <span className="ml-2 text-xs text-helm-muted">({node.issue_title})</span>
              )}
              <span className="ml-2 text-xs text-helm-muted">
                retry {node.retry_count ?? 0}/{node.max_retries ?? 0}
              </span>
              {node.last_error && (
                <span className="ml-2 text-xs text-helm-error">err: {node.last_error}</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
