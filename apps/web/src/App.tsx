import { Routes, Route } from "react-router-dom";
import { Index } from "./routes/index";
import { Company } from "./routes/company";
import { Demand } from "./routes/demand";
import { Approval } from "./routes/approval";
import { Dashboard } from "./routes/dashboard";

export default function App() {
  return (
    <div className="min-h-screen bg-helm-bg text-helm-muted">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/company/:id" element={<Company />} />
          <Route path="/company/:id/demand" element={<Demand />} />
          <Route path="/company/:id/approval/:approvalId" element={<Approval />} />
          <Route path="/company/:id/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}
