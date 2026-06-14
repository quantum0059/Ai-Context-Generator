"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface SuggestionOption {
  name: string;
  rationale: string;
}

interface SuggestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryTitle: string;
  suggestions: SuggestionOption[];
  onSelect: (suggestion: SuggestionOption) => void;
}

export function SuggestDialog({
  open,
  onOpenChange,
  categoryTitle,
  suggestions,
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
              <p className="text-sm font-medium text-white">
                {suggestion.name}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#888]">
                {suggestion.rationale}
              </p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
