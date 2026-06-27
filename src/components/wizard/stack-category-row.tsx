"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface StackCategoryRowProps {
  title: string;
  description: string;
  icon: LucideIcon;
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
  confirmed?: boolean;
  skipped?: boolean;
  showActions?: boolean;
  onSuggest: () => void;
  onNotNeeded: () => void;
  isCustom?: boolean;
}

export function StackCategoryRow({
  title,
  description,
  icon: Icon,
  options,
  value,
  onValueChange,
  confirmed = false,
  skipped = false,
  showActions = true,
  onSuggest,
  onNotNeeded,
  isCustom = false,
}: StackCategoryRowProps) {
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const handleCustomSave = () => {
    if (customValue.trim()) {
      onValueChange(customValue.trim());
    }
    setIsCustomMode(false);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-[#111111] px-5 py-5 sm:flex-row sm:items-center sm:px-6",
        skipped && "opacity-40",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
          {confirmed ? (
            <Check className="size-[18px] text-white" />
          ) : (
            <Icon className="size-[18px] text-white" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-medium text-white">{title}</p>
            {isCustom && (
              <Badge className="h-5 rounded bg-blue-500/10 px-1.5 text-[10px] font-medium text-blue-400 hover:bg-blue-500/10">
                Custom
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-[#888]">{description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {skipped ? (
          <Badge
            variant="outline"
            className="rounded-md border-white/[0.12] bg-transparent px-3 py-1 text-[13px] text-[#888]"
          >
            Skipped
          </Badge>
        ) : isCustomMode ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomSave();
                if (e.key === "Escape") setIsCustomMode(false);
              }}
              placeholder="e.g. My Custom Tool"
              className="h-9 w-[180px] rounded-md border border-white/[0.10] bg-[#1A1A1A] px-3 text-sm text-white placeholder:text-[#888] focus:outline-none focus:ring-1 focus:ring-white/[0.20]"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleCustomSave}
              className="h-9 rounded-lg border-white/[0.12] bg-[#222] px-3 text-[13px] text-white hover:bg-[#333]"
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCustomMode(false)}
              className="h-9 px-2 text-[13px] text-[#888] hover:text-white"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Select
            value={value}
            onValueChange={(next) => {
              if (next === "__CUSTOM__") {
                setCustomValue("");
                setIsCustomMode(true);
              } else {
                if (next) onValueChange(next);
              }
            }}
          >
            <SelectTrigger className="h-9 w-[200px] border-white/[0.10] bg-[#1A1A1A] text-sm text-white hover:bg-[#1A1A1A]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-white/[0.10] bg-[#1A1A1A] text-white">
              {options.map((option) => (
                <SelectItem
                  key={option}
                  value={option}
                  className="text-white focus:bg-white/[0.06] focus:text-white"
                >
                  {option}
                </SelectItem>
              ))}
              <SelectItem value="__CUSTOM__" className="text-blue-400 focus:bg-blue-500/10 focus:text-blue-400 border-t border-white/[0.06] mt-1 pt-2 font-medium">
                + Enter custom...
              </SelectItem>
            </SelectContent>
          </Select>
        )}

        {showActions && !skipped && !isCustomMode && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onSuggest}
              className="h-9 rounded-lg border-white/[0.12] bg-transparent px-3.5 text-[13px] text-white hover:bg-white/[0.06]"
            >
              Suggest for me
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onNotNeeded}
              className="h-9 rounded-lg border-white/[0.12] bg-transparent px-3.5 text-[13px] text-[#888] hover:bg-white/[0.06]"
            >
              Not needed
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
