"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";

type TreeNodeType = "folder" | "file";

interface TreeNode {
  name: string;
  type: TreeNodeType;
  path?: string;
  expandable?: boolean;
  children?: TreeNode[];
}

function buildTree(files: Record<string, string>, projectName: string): TreeNode[] {
  if (!files || Object.keys(files).length === 0) return [];

  const rootNode: TreeNode = {
    name: `${projectName || "project"}/`,
    type: "folder",
    expandable: true,
    children: [],
  };

  for (const filePath of Object.keys(files)) {
    const parts = filePath.split("/");
    let currentLevel = rootNode.children!;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      let existingNode = currentLevel.find((n) => n.name === (isFile ? part : `${part}/`));

      if (!existingNode) {
        existingNode = {
          name: isFile ? part : `${part}/`,
          type: isFile ? "file" : "folder",
          path: isFile ? currentPath : undefined,
          expandable: !isFile,
          children: isFile ? undefined : [],
        };
        currentLevel.push(existingNode);
      }

      if (!isFile) {
        currentLevel = existingNode.children!;
      }
    }
  }

  return [rootNode];
}

interface FolderNodeProps {
  node: TreeNode;
  level: number;
  bulletType: "chevron" | "square" | "none";
  selectedFile?: string | null;
  onSelectFile?: (path: string) => void;
}

function FolderNode({ node, level, bulletType, selectedFile, onSelectFile }: FolderNodeProps) {
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
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </>
  );
}

interface FileNodeProps {
  node: TreeNode;
  level: number;
  selectedFile?: string | null;
  onSelectFile?: (path: string) => void;
}

function FileNode({ node, level, selectedFile, onSelectFile }: FileNodeProps) {
  const paddingLeft = level * 16;
  const isSelected = selectedFile === node.path;

  return (
    <button
      onClick={() => {
        if (node.path && onSelectFile) {
          onSelectFile(node.path);
        }
      }}
      className={`flex w-full cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-left text-[13px] transition-colors ${
        isSelected ? "bg-white/10 text-white" : "text-[#CCCCCC] hover:bg-[rgba(255,255,255,0.04)]"
      }`}
      style={{ paddingLeft: `${paddingLeft}px` }}
    >
      <span className="text-[rgba(255,255,255,0.20)]">—</span>
      <File className={`size-3.5 shrink-0 ${isSelected ? "text-emerald-400" : "text-[#888]"}`} />
      <span>{node.name}</span>
    </button>
  );
}

interface TreeItemProps {
  node: TreeNode;
  level: number;
  selectedFile?: string | null;
  onSelectFile?: (path: string) => void;
}

function TreeItem({ node, level, selectedFile, onSelectFile }: TreeItemProps) {
  if (node.type === "folder") {
    const bulletType: "chevron" | "square" | "none" =
      level === 1 ? "square" : node.expandable ? "chevron" : "none";
    return (
      <FolderNode
        node={node}
        level={level}
        bulletType={bulletType}
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
      />
    );
  }
  return <FileNode node={node} level={level} selectedFile={selectedFile} onSelectFile={onSelectFile} />;
}

export interface FileTreeProps {
  highlight?: boolean;
  files?: Record<string, string>;
  projectName?: string;
  selectedFile?: string | null;
  onSelectFile?: (path: string) => void;
}

export function FileTree({ highlight = false, files = {}, projectName = "project", selectedFile, onSelectFile }: FileTreeProps) {
  const treeData = useMemo(() => buildTree(files, projectName), [files, projectName]);

  return (
    <div
      className={`rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] p-5 h-full max-h-[600px] overflow-y-auto transition-all duration-300 ${
        highlight ? "ring-1 ring-white/20 animate-pulse" : ""
      }`}
    >
      <h3 className="mb-4 text-[15px] font-semibold text-white">Package Structure</h3>

      {treeData.length === 0 ? (
        <div className="text-[13px] text-[#888] py-4">No files available</div>
      ) : (
        <div className="font-mono leading-[2]">
          {treeData.map((node) => (
            <TreeItem
              key={node.name}
              node={node}
              level={0}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

