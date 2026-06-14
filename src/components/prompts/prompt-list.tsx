"use client";

import React from "react";
import { Search, X } from "lucide-react";
import { promptsData, type PromptItem } from "@/lib/prompts-data";
import { cn } from "@/lib/utils";

interface PromptListProps {
  activeId: string;
  onSelect: (prompt: PromptItem) => void;
  collapsed: boolean;
  onCollapse: () => void;
  onReopen: () => void;
}

export function PromptList({
  activeId,
  onSelect,
  collapsed,
  onCollapse,
  onReopen,
}: PromptListProps) {
  const [search, setSearch] = React.useState("");

  const filtered = promptsData.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (collapsed) {
    return (
      <button
        onClick={onReopen}
        className="flex h-full w-0 flex-col items-center border-r border-[rgba(255,255,255,0.08)] bg-[#0D0D0D] py-4 transition-all hover:w-8"
        style={{ width: 32, minWidth: 32 }}
        title="Open prompt list"
      >
        <span className="rotate-180 text-xs text-[#888]">›</span>
      </button>
    );
  }

  return (
    <div
      className="flex flex-col border-r border-[rgba(255,255,255,0.08)] bg-[#0D0D0D]"
      style={{ width: 280, flexShrink: 0 }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] p-4">
        <span className="text-[15px] font-semibold text-white">Prompts</span>
        <button
          onClick={onCollapse}
          className="flex size-6 cursor-pointer items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.06)]"
          title="Close panel"
        >
          <X className="size-3.5 text-[#888]" />
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#888]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts..."
            className="h-9 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] pl-8 pr-3 text-sm text-white placeholder-[#888] outline-none focus:border-[rgba(255,255,255,0.15)]"
          />
        </div>
      </div>

      {/* Prompt list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.map((prompt) => {
          const isActive = prompt.id === activeId;
          return (
            <button
              key={prompt.id}
              onClick={() => onSelect(prompt)}
              className={cn(
                "mb-0.5 w-full cursor-pointer rounded-lg p-3 text-left transition-colors",
                isActive
                  ? "border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.08)]"
                  : "border border-transparent bg-transparent hover:bg-[rgba(255,255,255,0.04)]",
              )}
            >
              <div className="flex items-center gap-0 text-[14px] font-medium">
                <span className="text-[#888]">
                  {String(prompt.number).padStart(2, "0")}:
                </span>
                <span className="ml-1.5 truncate text-white">{prompt.name}</span>
              </div>
              <p className="mt-[3px] truncate text-[13px] text-[#888]">
                {prompt.preview}
              </p>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-[#888]">
            No prompts found
          </p>
        )}
      </div>
    </div>
  );
}
