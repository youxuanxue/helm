import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";

type GraphNode = {
  id: string;
  spec_ref: string;
  depends_on?: string[];
};

type GraphEdge = {
  from_node_id: string;
  to_node_id: string;
};

export interface TaskGraphPayload {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
}

function deriveEdges(nodes: GraphNode[], edges?: GraphEdge[]): GraphEdge[] {
  if (Array.isArray(edges) && edges.length > 0) {
    return edges;
  }
  return nodes.flatMap((node) =>
    (node.depends_on ?? []).map((depId) => ({
      from_node_id: depId,
      to_node_id: node.id,
    })),
  );
}

function buildLevels(nodes: GraphNode[]): Map<string, number> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number>();

  const calcLevel = (nodeId: string, visiting: Set<string>): number => {
    const cached = memo.get(nodeId);
    if (cached !== undefined) return cached;
    if (visiting.has(nodeId)) return 0;
    const node = nodeMap.get(nodeId);
    if (!node) return 0;

    visiting.add(nodeId);
    const deps = node.depends_on ?? [];
    const level =
      deps.length === 0 ? 0 : Math.max(...deps.map((depId) => calcLevel(depId, visiting))) + 1;
    visiting.delete(nodeId);
    memo.set(nodeId, level);
    return level;
  };

  nodes.forEach((node) => {
    calcLevel(node.id, new Set<string>());
  });
  return memo;
}

function toReactFlowNodes(nodes: GraphNode[]): Node[] {
  const levels = buildLevels(nodes);
  const levelCounts = new Map<number, number>();

  return nodes.map((node) => {
    const level = levels.get(node.id) ?? 0;
    const rowIndex = levelCounts.get(level) ?? 0;
    levelCounts.set(level, rowIndex + 1);
    return {
      id: node.id,
      data: {
        label: `${node.spec_ref} · ${node.id.slice(0, 8)}`,
      },
      position: {
        x: level * 260,
        y: rowIndex * 120,
      },
      style: {
        background: "#161b22",
        color: "#f0f6fc",
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: 8,
        minWidth: 200,
      },
    };
  });
}

function toReactFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((edge, index) => ({
    id: `${edge.from_node_id}->${edge.to_node_id}-${index}`,
    source: edge.from_node_id,
    target: edge.to_node_id,
    animated: false,
    style: { stroke: "#58a6ff" },
  }));
}

export function TaskGraph({ graph }: { graph: TaskGraphPayload }) {
  const nodes = graph.nodes ?? [];
  const edges = deriveEdges(nodes, graph.edges);
  const flowNodes = useMemo(() => toReactFlowNodes(nodes), [nodes]);
  const flowEdges = useMemo(() => toReactFlowEdges(edges), [edges]);

  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border border-helm-border bg-helm-surface p-4 text-sm text-helm-muted">
        无任务节点
      </div>
    );
  }

  return (
    <div className="h-80 overflow-hidden rounded-lg border border-helm-border bg-helm-surface">
      <ReactFlow nodes={flowNodes} edges={flowEdges} fitView>
        <Background color="#30363d" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
