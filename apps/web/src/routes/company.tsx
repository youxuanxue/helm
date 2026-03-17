import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Company } from "@helm/shared";

export function Company() {
  const { id } = useParams<{ id: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [mode, setMode] = useState<"template" | "manual">("template");
  const [templateId, setTemplateId] = useState("content-studio");
  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (id && id !== "new") {
      api.companies.get(id).then(setCompany as (c: unknown) => void);
      return;
    }
    api.templates.list().then((items) => {
      setTemplates(items);
      if (items.length > 0 && !items.some((t) => t.id === templateId)) {
        const first = items[0];
        if (first) {
          setTemplateId(first.id);
        }
      }
    });
  }, [id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload =
        mode === "template"
          ? { template_id: templateId, name: name.trim() || undefined }
          : {
              name: name.trim(),
              mission: mission.trim(),
              target_audience: targetAudience.trim(),
            };
      const result = (await api.companies.create(payload)) as { id: string };
      window.location.href = `/company/${result.id}`;
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (id === "new") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-helm-fg">新建公司</h1>
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border border-helm-border bg-helm-surface p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("template")}
              className={`rounded px-3 py-2 text-sm ${mode === "template" ? "bg-helm-accent text-helm-bg" : "border border-helm-border text-helm-fg"}`}
            >
              选模板（0 填写）
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`rounded px-3 py-2 text-sm ${mode === "manual" ? "bg-helm-accent text-helm-bg" : "border border-helm-border text-helm-fg"}`}
            >
              空白创建（3 项）
            </button>
          </div>

          {mode === "template" ? (
            <>
              <label className="block text-sm text-helm-muted">
                模板
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 w-full rounded border border-helm-border bg-helm-bg px-3 py-2 text-helm-fg"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-helm-muted">
                公司名（可选覆盖模板）
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded border border-helm-border bg-helm-bg px-3 py-2 text-helm-fg"
                  placeholder="可留空使用模板名"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block text-sm text-helm-muted">
                公司名
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded border border-helm-border bg-helm-bg px-3 py-2 text-helm-fg"
                />
              </label>
              <label className="block text-sm text-helm-muted">
                目标
                <input
                  required
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                  className="mt-1 w-full rounded border border-helm-border bg-helm-bg px-3 py-2 text-helm-fg"
                />
              </label>
              <label className="block text-sm text-helm-muted">
                服务对象
                <input
                  required
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="mt-1 w-full rounded border border-helm-border bg-helm-bg px-3 py-2 text-helm-fg"
                />
              </label>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-helm-accent px-4 py-2 text-helm-bg disabled:opacity-60"
          >
            {submitting ? "创建中…" : "创建公司"}
          </button>
        </form>
        <Link to="/" className="text-helm-accent hover:underline">
          ← 返回
        </Link>
      </div>
    );
  }

  if (!company) {
    return <div className="text-helm-muted">加载中…</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <Link to="/" className="mb-4 inline-block text-sm text-helm-accent hover:underline">
          ← 返回公司列表
        </Link>
        <h1 className="text-xl font-semibold text-helm-fg">{company.name}</h1>
        <p className="mt-1 text-sm text-helm-muted">{company.mission}</p>
      </header>

      <nav className="flex gap-4">
        <Link
          to={`/company/${id}/demand`}
          className="rounded border border-helm-border px-4 py-2 text-helm-fg hover:bg-helm-surface"
        >
          提需求
        </Link>
        <Link
          to={`/company/${id}/dashboard`}
          className="rounded border border-helm-border px-4 py-2 text-helm-fg hover:bg-helm-surface"
        >
          Dashboard
        </Link>
      </nav>
    </div>
  );
}
