"use client";

import React from "react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { PromptList } from "@/components/prompts/prompt-list";
import { PromptViewer } from "@/components/prompts/prompt-viewer";
import { BottomActionBar } from "@/components/prompts/bottom-action-bar";
import { promptsData, type PromptItem } from "@/lib/prompts-data";

export default function PromptsPage() {
  const [activePrompt, setActivePrompt] = React.useState<PromptItem>(promptsData[2]);
  const [panelCollapsed, setPanelCollapsed] = React.useState(false);

  const activeIndex = promptsData.findIndex((p) => p.id === activePrompt.id);

  const handlePrevious = () => {
    const prevIndex = (activeIndex - 1 + promptsData.length) % promptsData.length;
    setActivePrompt(promptsData[prevIndex]);
  };

  const handleNext = () => {
    const nextIndex = (activeIndex + 1) % promptsData.length;
    setActivePrompt(promptsData[nextIndex]);
  };

  return (
    <div className="flex min-h-screen bg-[#0A0A0A] text-white">
      <DashboardSidebar activeItem="projects" />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Page header */}
        <header className="flex items-center justify-center border-b border-[rgba(255,255,255,0.08)] px-8 py-5">
          <h1 className="text-[22px] font-bold text-white">Prompt Editor / Viewer</h1>
        </header>

        {/* Inner layout */}
        <div className="flex flex-1 flex-row overflow-hidden" style={{ height: "calc(100vh - 65px)" }}>
          {/* Left panel */}
          <PromptList
            activeId={activePrompt.id}
            onSelect={setActivePrompt}
            collapsed={panelCollapsed}
            onCollapse={() => setPanelCollapsed(true)}
            onReopen={() => setPanelCollapsed(false)}
          />

          {/* Right panel */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <PromptViewer prompt={activePrompt} />
            <BottomActionBar onPrevious={handlePrevious} onNext={handleNext} />
          </div>
        </div>
      </div>
    </div>
  );
}
