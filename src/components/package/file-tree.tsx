"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";

type TreeNodeType = "folder" | "file";

interface TreeNode {
  name: string;
  type: TreeNodeType;
  expandable?: boolean;
  children?: TreeNode[];
}

const treeData: TreeNode[] = [
  {
    name: "ai-chat-ems-platform-package/",
    type: "folder",
    expandable: true,
    children: [
      {
        name: "prompts/",
        type: "folder",
        expandable: true,
        children: [
          { name: "system-prompts/", type: "folder" },
          { name: "workflow/", type: "folder" },
          { name: "templates/", type: "folder" },
          { name: "responses/", type: "folder" },
        ],
      },
      {
        name: "data/",
        type: "folder",
        expandable: true,
        children: [
          { name: "department-data.json", type: "file" },
          { name: "user-permissions.csv", type: "file" },
          { name: "role-mappings.json", type: "file" },
          { name: "reference-data.csv", type: "file" },
        ],
      },
      {
        name: "database/",
        type: "folder",
        expandable: true,
        children: [
          { name: "ems.db", type: "file" },
          { name: "migrations/", type: "folder" },
          { name: "seeds.sql", type: "file" },
          { name: "backup (latest).sql", type: "file" },
        ],
      },
    ],
  },
];

function FolderNode({
  node,
  level,
  bulletType,
}: {
  node: TreeNode;
  level: number;
  bulletType: "chevron" | "square" | "none";
}) {
  const [expanded, setExpanded] = useState(true);

  const paddingLeft = level * 16;

  return (
    <>
      <button
        onClick={() => node.expandable && setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-left text-[13px] text-[#CCCCCC] hover:bg-[rgba(255,255,255,0.04)]"
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        {/* Chevron / bullet */}
        {node.expandable ? (
          expanded ? (
            <ChevronDown className="size-3 shrink-0 text-[#888]" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-[#888]" />
          )
        ) : bulletType === "square" ? (
          <span className="inline-block w-3 text-center text-[rgba(255,255,255,0.20)]">▪</span>
        ) : null}

        {/* Connector dash for children */}
        {level > 0 && bulletType !== "square" && (
          <span className="text-[rgba(255,255,255,0.20)]">—</span>
        )}

        <Folder className="size-3.5 shrink-0 text-[#888]" />
        <span>{node.name}</span>
      </button>

      {node.expandable && expanded && node.children && (
        <div className="overflow-hidden">
          {node.children.map((child) => (
            <TreeItem
              key={child.name}
              node={child}
              level={level + 1}
              parentIsFolder={true}
            />
          ))}
        </div>
      )}
    </>
  );
}

function FileNode({ node, level }: { node: TreeNode; level: number }) {
  const paddingLeft = level * 16;

  return (
    <div
      className="flex items-center gap-1.5 px-1 py-0.5 text-[13px] text-[#CCCCCC]"
      style={{ paddingLeft: `${paddingLeft}px` }}
    >
      <span className="text-[rgba(255,255,255,0.20)]">—</span>
      <File className="size-3.5 shrink-0 text-[#888]" />
      <span>{node.name}</span>
    </div>
  );
}

function TreeItem({
  node,
  level,
  parentIsFolder,
}: {
  node: TreeNode;
  level: number;
  parentIsFolder?: boolean;
}) {
  if (node.type === "folder") {
    const bulletType: "chevron" | "square" | "none" =
      level === 1 ? "square" : node.expandable ? "chevron" : "none";
    return <FolderNode node={node} level={level} bulletType={bulletType} />;
  }
  return <FileNode node={node} level={level} />;
}

export function FileTree({ highlight = false }: { highlight?: boolean } = {}) {
  return (
    <div
      className={`rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] p-5 transition-all duration-300 ${
        highlight ? "ring-1 ring-white/20 animate-pulse" : ""
      }`}
    >
      <h3 className="mb-4 text-[15px] font-semibold text-white">Package Structure</h3>

      <div className="font-mono leading-[2]">
        {treeData.map((node) => (
          <TreeItem key={node.name} node={node} level={0} />
        ))}

        {/* Collapsed placeholder */}
        <div className="flex items-center gap-1.5 py-0.5 pl-4 text-[13px] text-[#CCCCCC]">
          <ChevronRight className="size-3 shrink-0 text-[#888]" />
          <span className="text-[#888]">...</span>
        </div>
      </div>
    </div>
  );
}
