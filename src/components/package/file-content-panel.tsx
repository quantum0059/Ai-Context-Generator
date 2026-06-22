"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface FileContentPanelProps {
  filePath: string | null;
  content: string | null;
}

export function FileContentPanel({ filePath, content }: FileContentPanelProps) {
  const [copied, setCopied] = useState(false);

  if (!filePath) {
    return (
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] p-5 flex items-center justify-center h-full">
        <p className="text-[#888] text-sm">Select a file to view its contents</p>
      </div>
    );
  }

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isAgentsMd = filePath.endsWith("agents.md");

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] overflow-hidden flex flex-col h-full max-h-[600px]">
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4 py-3 bg-[#1A1A1A]">
        <span className="text-sm font-medium text-white truncate max-w-[80%]">{filePath}</span>
        <button
          onClick={handleCopy}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-[rgba(255,255,255,0.06)] px-2.5 py-1.5 text-xs text-white hover:bg-[rgba(255,255,255,0.1)] transition-colors"
        >
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? "Copied!" : (isAgentsMd ? "Copy for Claude/Cursor" : "Copy")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 bg-[#0A0A0A]">
        <pre className="text-[13px] text-[#CCCCCC] font-mono leading-[1.6] whitespace-pre-wrap">
          {content || "Empty file"}
        </pre>
      </div>
    </div>
  );
}
