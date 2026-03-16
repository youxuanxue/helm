import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Company } from "@helm/shared";

export function Index() {
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    api.companies.list().then(setCompanies as (c: unknown) => void);
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-helm-fg">Helm</h1>
        <p className="mt-1 text-sm text-helm-muted">
          单人公司 × AI 团队。你当 CEO，AI 当团队。
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-medium text-helm-fg">选择公司</h2>
        <div className="space-y-2">
          {companies.map((c) => (
            <Link
              key={c.id}
              to={`/company/${c.id}`}
              className="block rounded-lg border border-helm-border bg-helm-surface px-4 py-3 text-helm-fg transition hover:border-helm-accent"
            >
              <span className="font-medium">{c.name}</span>
              <span className="ml-2 text-sm text-helm-muted">— {c.mission}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <Link
          to="/company/new"
          className="inline-flex items-center rounded-lg border border-helm-accent bg-helm-accent/10 px-4 py-2 text-helm-accent hover:bg-helm-accent/20"
        >
          新建公司
        </Link>
      </section>
    </div>
  );
}
