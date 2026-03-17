export interface PlannedNode {
  id: string;
  spec_ref: string;
  depends_on: string[];
  title: string;
}

export interface PlannedEdge {
  from_node_id: string;
  to_node_id: string;
}

export interface PlannedTaskGraph {
  nodes: PlannedNode[];
  edges: PlannedEdge[];
}

interface PlannerContext {
  issueId: string;
  demand: string;
}

function makeNode(specRef: string, title: string, dependsOn: string[] = []): PlannedNode {
  return {
    id: crypto.randomUUID(),
    spec_ref: specRef,
    depends_on: dependsOn,
    title,
  };
}

/**
 * Minimal COO planner:
 * - Default: 3-step pipeline (analysis -> execution -> review)
 * - If demand hints "quick/快速/简单", reduce to 2-step pipeline
 */
export function planTaskGraph(context: PlannerContext): PlannedTaskGraph {
  const normalized = context.demand.toLowerCase();
  const isQuick = /quick|快速|简单/.test(normalized);

  if (isQuick) {
    const execute = makeNode("agent.execute", "执行任务");
    const review = makeNode("agent.review", "结果复核", [execute.id]);
    return {
      nodes: [execute, review],
      edges: [{ from_node_id: execute.id, to_node_id: review.id }],
    };
  }

  const analyze = makeNode("agent.analyze", "需求分析");
  const execute = makeNode("agent.execute", "方案执行", [analyze.id]);
  const review = makeNode("agent.review", "质量验收", [execute.id]);
  return {
    nodes: [analyze, execute, review],
    edges: [
      { from_node_id: analyze.id, to_node_id: execute.id },
      { from_node_id: execute.id, to_node_id: review.id },
    ],
  };
}
