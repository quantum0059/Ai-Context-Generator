"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface SummarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const metadata = [
  { label: "Package Name", value: "AI Chat: EMS Platform" },
  { label: "Version", value: "v2.4.7" },
  { label: "File Count", value: "24 files" },
  { label: "Generated", value: "2024-05-28 14:30" },
  { label: "Package Size", value: "3.35 MB" },
  { label: "Prompts", value: "8 prompts" },
  { label: "Data Files", value: "6 files" },
  { label: "Databases", value: "3 databases" },
];

export function SummarySheet({ open, onOpenChange }: SummarySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[340px] border-l border-[rgba(255,255,255,0.08)] bg-[#0D0D0D] text-white sm:max-w-[340px]"
      >
        <SheetHeader className="border-b border-[rgba(255,255,255,0.08)] p-5">
          <SheetTitle className="text-white">Package Summary</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-0 divide-y divide-[rgba(255,255,255,0.06)] p-5">
          {metadata.map((item) => (
            <div key={item.label} className="flex items-center justify-between py-3.5">
              <span className="text-[13px] text-[#888]">{item.label}</span>
              <span className="text-[13px] font-medium text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
