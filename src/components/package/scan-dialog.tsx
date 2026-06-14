"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

interface ScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScanDialog({ open, onOpenChange }: ScanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-[rgba(255,255,255,0.08)] bg-[#111111] text-white sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <ShieldCheck className="size-4 text-white" />
            Security Scan
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0D0D0D] p-4">
          <p className="text-sm text-[#CCCCCC]">
            No issues found. Package is clean.
          </p>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
