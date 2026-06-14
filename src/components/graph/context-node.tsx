"use client";

import { Handle, Position, type NodeProps } from "reactflow";

interface ContextNodeData {
  label: string;
  subtitle?: string;
  variant?: "default" | "center";
}

export function ContextNode({ data }: NodeProps<ContextNodeData>) {
  const isCenter = data.variant === "center";

  return (
    <div
      className={
        isCenter
          ? "rounded-xl border border-[rgba(255,255,255,0.18)] bg-[#1A1A1A] px-7 py-5 text-center shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
          : "rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#141414] px-5 py-3.5 text-center shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
      }
      style={{ minWidth: isCenter ? 180 : 140 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div
        className={
          isCenter
            ? "text-base font-bold text-white"
            : "text-sm font-semibold text-white"
        }
      >
        {data.label}
      </div>
      {data.subtitle && (
        <div className="mt-1 text-xs text-[#888]">{data.subtitle}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </div>
  );
}
