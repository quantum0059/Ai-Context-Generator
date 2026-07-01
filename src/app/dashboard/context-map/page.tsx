"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { RefreshCw, Sparkles, Upload } from "lucide-react";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { ContextNode } from "@/components/graph/context-node";
import { LegendPanel } from "@/components/graph/legend-panel";
import { DependenciesPanel } from "@/components/graph/dependencies-panel";

// ─── Repo tree → graph ────────────────────────────────────────────────────────

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
}

const defaultEdgeStyleTop = {
  stroke: "rgba(255,255,255,0.20)",
  strokeWidth: 1.5,
  strokeDasharray: "5 5",
};
const defaultMarkerEndTop = {
  type: MarkerType.ArrowClosed,
  color: "rgba(255,255,255,0.30)",
};

/**
 * Converts a flat, recursive repo file tree into React Flow nodes/edges laid
 * out as a directory hierarchy: depth drives the X column, sibling order drives
 * Y. Directories render as "center"-style nodes, files as default nodes.
 */
function treeToGraph(entries: TreeEntry[]): { nodes: Node[]; edges: Edge[] } {
  const COL_WIDTH = 260;
  const ROW_HEIGHT = 64;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const rowByDepth = new Map<number, number>();

  // Root node.
  nodes.push({
    id: "__root__",
    position: { x: 0, y: 0 },
    data: { label: "Repository", subtitle: `${entries.length} entries`, variant: "center" },
    type: "centerNode",
  });

  // Sort so parents are processed before children and order is stable.
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of sorted) {
    const segments = entry.path.split("/");
    const depth = segments.length; // 1 = top-level
    const row = rowByDepth.get(depth) ?? 0;
    rowByDepth.set(depth, row + 1);

    const id = entry.path;
    const parentId = segments.length > 1 ? segments.slice(0, -1).join("/") : "__root__";
    const name = segments[segments.length - 1];

    nodes.push({
      id,
      position: { x: depth * COL_WIDTH, y: row * ROW_HEIGHT },
      data: {
        label: name,
        subtitle: entry.type === "tree" ? "Folder" : "File",
        variant: entry.type === "tree" ? "center" : undefined,
      },
      type: entry.type === "tree" ? "centerNode" : "defaultNode",
    });

    edges.push({
      id: `${parentId}->${id}`,
      source: parentId,
      target: id,
      type: "default",
      animated: false,
      style: defaultEdgeStyleTop,
      markerEnd: defaultMarkerEndTop,
    });
  }

  return { nodes, edges };
}

const nodeTypes = {
  centerNode: ContextNode,
  defaultNode: ContextNode,
};

const initialNodes: Node[] = [
  {
    id: "center",
    position: { x: 380, y: 300 },
    data: { label: "AI Chat SaaS Platform", subtitle: "", variant: "center" },
    type: "centerNode",
  },
  {
    id: "interface",
    position: { x: 380, y: 60 },
    data: { label: "Interface", subtitle: "Frontend Application" },
    type: "defaultNode",
  },
  {
    id: "backend",
    position: { x: 130, y: 180 },
    data: { label: "Backend", subtitle: "Server & Logic Layer" },
    type: "defaultNode",
  },
  {
    id: "chat",
    position: { x: 630, y: 180 },
    data: { label: "Chat", subtitle: "AI API & Services" },
    type: "defaultNode",
  },
  {
    id: "portal",
    position: { x: 60, y: 380 },
    data: { label: "Portal", subtitle: "Admin UI" },
    type: "defaultNode",
  },
  {
    id: "database",
    position: { x: 630, y: 380 },
    data: { label: "Database", subtitle: "Data Store" },
    type: "defaultNode",
  },
  {
    id: "stripe",
    position: { x: 160, y: 520 },
    data: { label: "Stripe", subtitle: "Payments" },
    type: "defaultNode",
  },
  {
    id: "openai",
    position: { x: 400, y: 540 },
    data: { label: "OpenAI", subtitle: "AI Models" },
    type: "defaultNode",
  },
];

const defaultEdgeStyle = {
  stroke: "rgba(255,255,255,0.20)",
  strokeWidth: 1.5,
  strokeDasharray: "5 5",
};

const defaultMarkerEnd = {
  type: MarkerType.ArrowClosed,
  color: "rgba(255,255,255,0.30)",
};

const initialEdges: Edge[] = [
  { id: "interface-center", source: "interface", target: "center", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "backend-center", source: "backend", target: "center", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "chat-center", source: "chat", target: "center", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "portal-center", source: "portal", target: "center", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "center-portal", source: "center", target: "portal", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "database-center", source: "database", target: "center", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "stripe-center", source: "stripe", target: "center", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "openai-center", source: "openai", target: "center", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "interface-chat", source: "interface", target: "chat", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "chat-openai", source: "chat", target: "openai", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "openai-database", source: "openai", target: "database", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
  { id: "stripe-database", source: "stripe", target: "database", type: "default", animated: true, style: defaultEdgeStyle, markerEnd: defaultMarkerEnd },
];

export default function ContextMapPage() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setEdges((eds) =>
        eds.map((edge) => {
          const isConnected =
            edge.source === node.id || edge.target === node.id;
          return {
            ...edge,
            style: {
              ...edge.style,
              stroke: isConnected
                ? "rgba(255,255,255,1)"
                : "rgba(255,255,255,0.08)",
              strokeWidth: 1.5,
              strokeDasharray: "5 5",
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isConnected
                ? "rgba(255,255,255,1)"
                : "rgba(255,255,255,0.08)",
            },
          } as Edge;
        })
      );
    },
    [setEdges]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        style: { ...defaultEdgeStyle },
        markerEnd: { ...defaultMarkerEnd },
      }))
    );
  }, [setEdges]);

  const memoNodeTypes = useMemo(() => nodeTypes, []);

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-white">
      <DashboardSidebar activeItem="projects" />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-8 py-6">
          <div>
            <h1 className="text-[22px] font-bold text-white">
              Context Map / Dependency Graph
            </h1>
            <p className="mt-1 text-[13px] text-[#888]">
              Visualize the relationships and dependencies between systems and services.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#111111] px-3.5 py-2 text-[13px] text-white transition-colors hover:bg-[#1a1a1a]">
              <Sparkles className="size-4 text-white" />
              View Guides
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#111111] px-3.5 py-2 text-[13px] text-white transition-colors hover:bg-[#1a1a1a]">
              <Upload className="size-4 text-white" />
              Export
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="relative flex-1">
          <LegendPanel />
          <DependenciesPanel />

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={memoNodeTypes}
            fitView
            nodesDraggable
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="rgba(255,255,255,0.06)"
              gap={20}
              size={1}
            />
            <MiniMap
              position="bottom-right"
              style={{
                background: "#111111",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
              }}
              nodeColor="#333"
              maskColor="rgba(0,0,0,0.6)"
            />
            <Controls
              position="bottom-right"
              style={{
                background: "#111111",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                marginBottom: "130px",
              }}
            />
          </ReactFlow>
        </div>
      </main>
    </div>
  );
}
