import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { TaskGraph, type TaskGraphPayload } from "../components/TaskGraph";

interface ApprovalData {
  id: string;
  type: string;
  status: string;
  payload: object | string;
}

type ApprovalPayload = {
  issue_id?: string;
  demand?: string;
  task_graph?: TaskGraphPayload;
};

function parsePayload(payload: object | string): ApprovalPayload {
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as ApprovalPayload;
    } catch {
      return {};
    }
  }
  return payload as ApprovalPayload;
}

export function Approval() {
  const { id, approvalId } = useParams<{ id: string; approvalId: string }>();
  const [approval, setApproval] = useState<ApprovalData | null>(null);

  useEffect(() => {
    if (id && approvalId) {
      api.approvals.get(approvalId).then((r) => setApproval(r as ApprovalData));
    }
  }, [id, approvalId]);

  const handleApprove = async () => {
    if (!approvalId) return;
    await api.approvals.approve(approvalId);
    window.location.href = `/company/${id}/dashboard`;
  };

  const handleReject = async () => {
    if (!approvalId) return;
    await api.approvals.reject(approvalId);
    window.location.href = `/company/${id}/dashboard`;
  };

  if (!approval) {
    return <div className="text-helm-muted">加载中…</div>;
  }

  const parsedPayload = parsePayload(approval.payload);

  return (
    <div className="space-y-6">
      <Link to={`/company/${id}`} className="inline-block text-sm text-helm-accent hover:underline">
        ← 返回公司
      </Link>
      <h1 className="text-xl font-semibold text-helm-fg">审批任务图</h1>
      <TaskGraph graph={parsedPayload.task_graph ?? {}} />
      <div className="rounded-lg border border-helm-border bg-helm-surface p-4">
        <pre className="text-sm text-helm-muted">{JSON.stringify(parsedPayload, null, 2)}</pre>
      </div>
      <div className="flex gap-4">
        <button
          onClick={handleApprove}
          className="rounded-lg bg-helm-success px-4 py-2 text-white"
        >
          同意
        </button>
        <button
          onClick={handleReject}
          className="rounded-lg border border-helm-border px-4 py-2 text-helm-fg"
        >
          拒绝
        </button>
      </div>
    </div>
  );
}
