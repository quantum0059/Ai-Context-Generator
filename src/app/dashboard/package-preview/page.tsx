"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { InnerSidebar } from "@/components/package/inner-sidebar";
import { PackageStatsRow } from "@/components/package/stats-row";
import { FileTree } from "@/components/package/file-tree";
import { QuickActions } from "@/components/package/quick-actions";
import { ScanDialog } from "@/components/package/scan-dialog";
import { SummarySheet } from "@/components/package/summary-sheet";
import { ToastProvider, useToast } from "@/components/ui/toast";

function PackagePreviewInner() {
  const { showToast } = useToast();
  const fileTreeRef = useRef<HTMLDivElement>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [highlightTree, setHighlightTree] = useState(false);

  const handleDownload = () => {
    console.log("Package download triggered");
    showToast("Package download started...");
  };

  const handleViewContents = () => {
    fileTreeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightTree(true);
    setTimeout(() => setHighlightTree(false), 1500);
  };

  const handleScanPackage = () => {
    setScanOpen(true);
  };

  const handleViewSummary = () => {
    setSummaryOpen(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-white">
      {/* Page header */}
      <header className="flex shrink-0 items-center border-b border-[rgba(255,255,255,0.08)] px-8 py-5">
        <h1 className="text-[22px] font-bold text-white">Generated Package Preview</h1>
      </header>

      {/* Inner layout: sidebar + content */}
      <div className="flex flex-1 flex-row overflow-hidden" style={{ height: "calc(100vh - 65px)" }}>
        {/* App sidebar (far left) */}
        <DashboardSidebar activeItem="projects" />

        {/* Inner project sidebar */}
        <InnerSidebar activeItem="overview" />

        {/* Main content */}
        <main className="flex flex-1 flex-col gap-6 overflow-y-auto px-8 py-7">
          {/* Section 1: Package Overview */}
          <section className="flex items-start justify-between">
            <div>
              <h2 className="text-[20px] font-bold text-white">Package Overview</h2>
              <p className="mt-1 text-[13px] text-[#888]">
                Your download package is ready to download and explore the contents
              </p>
            </div>

            <button
              onClick={handleDownload}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.12)] bg-[#1A1A1A] px-4.5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[rgba(255,255,255,0.08)]"
            >
              <Download className="size-4" />
              Download Package
            </button>
          </section>

          {/* Stats row */}
          <PackageStatsRow />

          {/* Section 2: Two-column layout */}
          <section className="grid grid-cols-[1fr_280px] gap-4">
            {/* Left: File tree */}
            <div ref={fileTreeRef}>
              <FileTree
                highlight={highlightTree}
              />
            </div>

            {/* Right: Quick actions */}
            <QuickActions
              onDownload={handleDownload}
              onViewContents={handleViewContents}
              onScanPackage={handleScanPackage}
              onViewSummary={handleViewSummary}
            />
          </section>
        </main>
      </div>

      {/* Dialogs & Sheets */}
      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} />
      <SummarySheet open={summaryOpen} onOpenChange={setSummaryOpen} />
    </div>
  );
}

export default function PackagePreviewPage() {
  return (
    <ToastProvider>
      <PackagePreviewInner />
    </ToastProvider>
  );
}
