"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Confidence, StackSource } from "@/types/projectspec";

export interface SuggestionOption {
  name: string;
  rationale: string;
  installCommand?: string;
  source?: Exclude<StackSource, "user">;
  confidence?: Confidence;
}

interface SuggestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryTitle: string;
  suggestions: SuggestionOption[];
  recommendationSummary?: string;
  tradeoffs?: string[];
  onSelect: (suggestion: SuggestionOption) => void;
}

export function SuggestDialog({
  open,
  onOpenChange,
  categoryTitle,
  suggestions,
  recommendationSummary,
  tradeoffs = [],
  onSelect,
}: SuggestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="border border-white/[0.08] bg-[#111111] text-white ring-0 sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-medium text-white">
            AI suggestions for {categoryTitle}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#888]">
            These suggestions are tailored to your project. Pick one to apply it
            to your stack.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {recommendationSummary && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                Recommended Default
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#D4D4D8]">
                {recommendationSummary}
              </p>
            </div>
          )}
          {tradeoffs.length > 0 && (
            <div className="rounded-lg border border-white/[0.08] bg-[#151515] p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#A1A1AA]">
                Alternative Trade-offs
              </p>
              <div className="mt-2 space-y-2">
                {tradeoffs.map((tradeoff) => (
                  <p key={tradeoff} className="text-xs leading-relaxed text-[#A1A1AA]">
                    {tradeoff}
                  </p>
                ))}
              </div>
            </div>
          )}
          {suggestions.length === 0 && (
            <p className="rounded-lg border border-white/[0.08] p-3 text-sm text-[#888]">
              No alternatives are available for this category yet.
            </p>
          )}
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() => {
                onSelect(suggestion);
                onOpenChange(false);
              }}
              className={cn(
                "w-full rounded-lg border border-white/[0.08] bg-[#1A1A1A] p-3 text-left transition-colors",
                "hover:border-white/[0.16] hover:bg-white/[0.04]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-white">
                  {suggestion.name}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  {suggestion.source && (
                    <span className="rounded-full border border-white/[0.10] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[#A1A1AA]">
                      {suggestion.source}
                    </span>
                  )}
                  {suggestion.confidence && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]",
                        suggestion.confidence === "high"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-amber-500/10 text-amber-300",
                      )}
                    >
                      {suggestion.confidence} confidence
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#888]">
                {suggestion.rationale}
              </p>
              {suggestion.installCommand && (
                <div className="mt-2 rounded bg-black/40 px-2 py-1.5 font-mono text-[10px] text-[#A1A1AA]">
                  {suggestion.installCommand}
                </div>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
