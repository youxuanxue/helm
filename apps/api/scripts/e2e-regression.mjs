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
  const templateId = `ci-template-${Date.now()}`;
  const createTemplate = await request("POST", "/company-templates", {
    id: templateId,
    name: "CI Template",
    version: "1.0.0",
    spec: {
      identity: { name: "CI Co" },
      mission: { statement: "CI Mission" },
      target_audience: { summary: "CI Audience" },
    },
  });
  assert(createTemplate.status === 201, "Template creation failed");

  const createCompany = await request("POST", "/companies", {
    template_id: templateId,
    name: "E2E Company",
  });
  assert(createCompany.status === 201, "Company creation failed");
  const companyId = createCompany.json.id;

  const goals = await request("GET", `/companies/${companyId}/goals`);
  assert(goals.status === 200 && goals.json.length >= 1, "Default goal not created");
  const rootGoalId = goals.json[0].id;

  const createGoal = await request("POST", "/goals", {
    company_id: companyId,
    title: "增长目标",
    level: "team",
    parent_id: rootGoalId,
  });
  assert(createGoal.status === 201, "Team goal creation failed");

  const createProject = await request("POST", "/projects", {
    company_id: companyId,
    goal_id: createGoal.json.id,
    name: "增长项目",
  });
  assert(createProject.status === 201, "Project creation failed");

  const createDemand = await request("POST", `/companies/${companyId}/demands`, {
    demand: "执行增长任务",
    project_id: createProject.json.id,
  });
  assert(createDemand.status === 201, "Demand creation failed");
  const issueId = createDemand.json.id;

  const approve = await request("POST", `/approvals/${createDemand.json.approval_id}/approve`, {});
  assert(approve.status === 200, "Task graph approval failed");

  for (let i = 0; i < 4; i += 1) {
    const heartbeat = await request("POST", `/companies/${companyId}/heartbeat`, {});
    assert(heartbeat.status === 201, `Heartbeat ${i} failed`);
  }

  const nodes = await request("GET", `/companies/${companyId}/action-nodes`);
  assert(nodes.status === 200, "Load action nodes failed");
  assert(nodes.json.length >= 1, "No action nodes found");
  assert(
    nodes.json.every((node) => ["succeed", "cancelled"].includes(node.status)),
    "Not all action nodes reached terminal state",
  );
  assert(
    nodes.json.some((node) => node.adapter_run_id && node.executor_agent_id),
    "Adapter runtime fields missing",
  );

  const issues = await request("GET", `/companies/${companyId}/issues`);
  assert(issues.status === 200 && issues.json.length >= 1, "Issue list missing");
  assert(issues.json[0].project_id === createProject.json.id, "Issue project traceability broken");
  assert(issues.json[0].status === "done", "Issue status should be done after runtime loop");

  const report = {
    company_id: companyId,
    issue_id: issueId,
    template_id: templateId,
    node_count: nodes.json.length,
    final_issue_status: issues.json[0].status,
  };
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
