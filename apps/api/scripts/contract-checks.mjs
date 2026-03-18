const base = process.env.HELM_API_URL ?? "http://localhost:3000";

async function request(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const companyA = await request("POST", "/companies", {
    name: "Contract A",
    mission: "Contract Mission A",
    target_audience: "Audience A",
  });
  const companyB = await request("POST", "/companies", {
    name: "Contract B",
    mission: "Contract Mission B",
    target_audience: "Audience B",
  });
  assert(companyA.status === 201 && companyB.status === 201, "Failed to create contract companies");

  const invalidTemplate = await request("GET", "/templates/%2E%2E%2Fbad");
  assert(invalidTemplate.status === 400, "Invalid template id should be rejected");
  const invalidCompanyPath = await request("GET", "/companies/%2E%2E%2Fbad/issues");
  assert(invalidCompanyPath.status === 400, "Invalid company id should be rejected");
  const invalidApprovalQuery = await request("GET", "/approvals?company_id=%2E%2E%2Fbad");
  assert(invalidApprovalQuery.status === 400, "Invalid approvals company_id should be rejected");

  const hireA = await request("POST", "/agents", {
    company_id: companyA.json.id,
    name: "contract-agent-a",
    role: "analyze",
  });
  const hireB = await request("POST", "/agents", {
    company_id: companyB.json.id,
    name: "contract-agent-b",
  });
  assert(hireA.status === 201 && hireB.status === 201, "Hire request creation failed");
  assert((await request("POST", `/approvals/${hireA.json.approval_id}/approve`, {})).status === 200, "Approve hireA failed");
  assert((await request("POST", `/approvals/${hireB.json.approval_id}/approve`, {})).status === 200, "Approve hireB failed");

  const agentsA = await request("GET", `/agents?company_id=${companyA.json.id}`);
  const agentsB = await request("GET", `/agents?company_id=${companyB.json.id}`);
  const agentA = agentsA.json.find((row) => row.name === "contract-agent-a")?.id;
  const agentB = agentsB.json.find((row) => row.name === "contract-agent-b")?.id;
  assert(agentA && agentB, "Agent ids missing for contract test");

  const crossReportTo = await request("POST", "/agents", {
    company_id: companyB.json.id,
    name: "contract-agent-b2",
    reports_to: agentA,
  });
  assert(crossReportTo.status === 409, "Cross-company reports_to should be rejected");

  const demand = await request("POST", `/companies/${companyA.json.id}/demands`, { demand: "contract demand" });
  assert(demand.status === 201, "Demand creation failed");
  assert((await request("POST", `/approvals/${demand.json.approval_id}/approve`, {})).status === 200, "Approve task graph failed");

  const checkoutInvalidStatus = await request("POST", `/issues/${demand.json.id}/checkout`, {
    agentId: agentA,
    expectedStatuses: ["INVALID"],
  });
  assert(checkoutInvalidStatus.status === 400, "Invalid expectedStatuses should be rejected");

  const checkoutCrossCompany = await request("POST", `/issues/${demand.json.id}/checkout`, {
    agentId: agentB,
    expectedStatuses: ["todo", "backlog", "blocked", "in_progress"],
  });
  assert(checkoutCrossCompany.status === 409, "Cross-company checkout should be rejected");

  const checkoutSameCompany = await request("POST", `/issues/${demand.json.id}/checkout`, {
    agentId: agentA,
    expectedStatuses: ["todo", "backlog", "blocked", "in_progress"],
  });
  assert(checkoutSameCompany.status === 200, "Same-company checkout should succeed");
  const setAgentBudget = await request("PATCH", `/agents/${agentA}/budget`, {
    company_id: companyA.json.id,
    amount_cents: 0,
  });
  assert(setAgentBudget.status === 200, "Agent budget update failed");
  const heartbeat = await request("POST", `/companies/${companyA.json.id}/heartbeat`, {});
  assert(heartbeat.status === 201, "Heartbeat for budget check failed");

  const nodeList = await request("GET", `/companies/${companyA.json.id}/action-nodes`);
  assert(nodeList.status === 200 && nodeList.json.length > 0, "Action nodes missing for contract checks");
  assert(
    nodeList.json.some((row) => row.adapter_status === "budget_blocked"),
    "Agent budget should block at least one action node",
  );
  const agentsAfterBudget = await request("GET", `/agents?company_id=${companyA.json.id}`);
  const agentAAfterBudget = agentsAfterBudget.json.find((row) => row.id === agentA);
  assert(agentAAfterBudget?.status === "paused", "Agent should auto-pause after budget exceeded");
  const agentCosts = await request("GET", `/companies/${companyA.json.id}/costs/agents`);
  assert(agentCosts.status === 200, "Agent costs endpoint failed");
  const agentACost = agentCosts.json.find((row) => row.id === agentA);
  assert(agentACost?.over_budget === true, "Agent costs should expose over_budget");
  const nodeId = nodeList.json[0].id;
  const badHandoff = await request("POST", `/action-nodes/${nodeId}/handoff`, {
    task_id: "wrong-task-id",
    status: {
      state: "succeed",
      timestamp: new Date().toISOString(),
    },
  });
  assert(badHandoff.status === 400, "Mismatched handoff task_id should be rejected");

  console.log(
    JSON.stringify(
      {
        invalid_template_status: invalidTemplate.status,
        invalid_company_path_status: invalidCompanyPath.status,
        invalid_approvals_query_status: invalidApprovalQuery.status,
        cross_reports_to_status: crossReportTo.status,
        invalid_expected_status_status: checkoutInvalidStatus.status,
        cross_checkout_status: checkoutCrossCompany.status,
        same_checkout_status: checkoutSameCompany.status,
        set_agent_budget_status: setAgentBudget.status,
        heartbeat_budget_check_status: heartbeat.status,
        agent_auto_paused_status: agentAAfterBudget?.status ?? "unknown",
        agent_over_budget_flag: agentACost?.over_budget ?? null,
        bad_handoff_status: badHandoff.status,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
