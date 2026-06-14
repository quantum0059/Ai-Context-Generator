"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import type { PromptItem } from "@/lib/prompts-data";
import { cn } from "@/lib/utils";

interface PromptViewerProps {
  prompt: PromptItem;
}

function parseMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={key++} className="mb-3 ml-4 list-none space-y-1 pl-4">
          {listBuffer.map((item, i) => (
            <li
              key={i}
              className="relative text-[15px] leading-[1.8] text-[#CCCCCC] before:absolute before:-left-4 before:text-[#CCCCCC] before:content-['·']"
            >
              {item}
            </li>
          ))}
        </ul>,
      );
      listBuffer = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(
        <h1
          key={key++}
          className="mb-3 mt-0 text-2xl font-bold text-white"
        >
          {trimmed.slice(2)}
        </h1>,
      );
    } else if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h2
          key={key++}
          className="mb-2.5 mt-7 text-lg font-semibold text-white"
        >
          {trimmed.slice(3)}
        </h2>,
      );
    } else if (trimmed.startsWith("- ")) {
      listBuffer.push(trimmed.slice(2));
    } else if (trimmed.startsWith("Step ")) {
      flushList();
      elements.push(
        <p
          key={key++}
          className="mb-2 text-[15px] leading-[1.7] text-[#CCCCCC]"
        >
          {trimmed}
        </p>,
      );
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p
          key={key++}
          className="mb-3 text-[15px] leading-[1.7] text-[#CCCCCC]"
        >
          {trimmed}
        </p>,
      );
    }
  });

  flushList();
  return elements;
}

export function PromptViewer({ prompt }: PromptViewerProps) {
  const [activeTab, setActiveTab] = React.useState<"preview" | "raw">("preview");

  const filename = `${String(prompt.number).padStart(2, "0")}:  ${prompt.name}.md`;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-6 py-4">
        <span className="text-base font-semibold text-white">{filename}</span>
        <button
          onClick={() => console.log("Open prompt:", prompt.id)}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#111111] px-3.5 py-1.5 text-[13px] text-white transition-colors hover:bg-[#1a1a1a]"
        >
          <ExternalLink className="size-3.5" />
          Open
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-end gap-6 border-b border-[rgba(255,255,255,0.08)] px-6" style={{ height: 42 }}>
        {(["preview", "raw"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "cursor-pointer border-b-2 pb-2.5 text-sm capitalize transition-colors",
              activeTab === tab
                ? "border-white font-medium text-white"
                : "border-transparent text-[#888] hover:text-white",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {activeTab === "preview" ? (
          <div>{parseMarkdown(prompt.content)}</div>
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0D0D0D] p-5 font-mono text-[13px] leading-[1.7] text-[#CCCCCC]">
            {prompt.content}
          </pre>
        )}
      </div>
    </div>
  );
}
