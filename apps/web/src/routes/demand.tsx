import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";

export function Demand() {
  const { id } = useParams<{ id: string }>();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastApprovalId, setLastApprovalId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !text.trim()) return;
    setSubmitting(true);
    try {
      const result = (await api.demands.create(id, { demand: text.trim() })) as {
        approval_id?: string;
      };
      setLastApprovalId(result.approval_id ?? null);
      setText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link to={`/company/${id}`} className="inline-block text-sm text-helm-accent hover:underline">
        ← 返回公司
      </Link>
      <h1 className="text-xl font-semibold text-helm-fg">提需求</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="描述你想要什么..."
          className="w-full rounded-lg border border-helm-border bg-helm-surface px-4 py-3 text-helm-fg placeholder:text-helm-muted focus:border-helm-accent focus:outline-none"
          rows={4}
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-helm-accent px-4 py-2 text-helm-bg disabled:opacity-50"
        >
          {submitting ? "提交中…" : "提交"}
        </button>
        {lastApprovalId && (
          <Link
            to={`/company/${id}/approval/${lastApprovalId}`}
            className="ml-3 text-sm text-helm-accent hover:underline"
          >
            查看待审批任务图 →
          </Link>
        )}
      </form>
    </div>
  );
}
