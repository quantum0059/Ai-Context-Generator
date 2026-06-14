"use client";

import { RotateCcw, RotateCw } from "lucide-react";

interface BottomActionBarProps {
  onPrevious: () => void;
  onNext: () => void;
}

export function BottomActionBar({ onPrevious, onNext }: BottomActionBarProps) {
  return (
    <div
      className="flex items-stretch border-t border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)]"
      style={{ height: 64 }}
    >
      {/* Previous button */}
      <button
        onClick={onPrevious}
        title="Previous prompt"
        className="group relative flex flex-1 cursor-pointer items-center justify-center bg-transparent transition-colors hover:bg-[rgba(255,255,255,0.06)]"
      >
        <RotateCcw className="size-[22px] text-white" />
        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#222] px-2.5 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          Previous prompt
        </span>
      </button>

      {/* Divider */}
      <div className="w-px bg-[rgba(255,255,255,0.08)]" />

      {/* Next button */}
      <button
        onClick={onNext}
        title="Next prompt"
        className="group relative flex flex-1 cursor-pointer items-center justify-center bg-transparent transition-colors hover:bg-[rgba(255,255,255,0.06)]"
      >
        <RotateCw className="size-[22px] text-white" />
        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#222] px-2.5 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          Next prompt
        </span>
      </button>
    </div>
  );
}
