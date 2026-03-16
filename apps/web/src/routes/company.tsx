import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Company } from "@helm/shared";

export function Company() {
  const { id } = useParams<{ id: string }>();
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    if (id && id !== "new") {
      api.companies.get(id).then(setCompany as (c: unknown) => void);
    }
  }, [id]);

  if (id === "new") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-helm-fg">新建公司</h1>
        <p className="text-helm-muted">选模板或空白创建（开发中）</p>
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
