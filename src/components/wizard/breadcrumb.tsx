import Link from "next/link";
import { Sparkles } from "lucide-react";

export function WizardBreadcrumb() {
  return (
    <div className="flex h-12 items-center border-b border-white/[0.08] bg-[#0A0A0A] px-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-md bg-white/10">
          <Sparkles className="size-3 text-white" />
        </span>
        <p className="text-sm">
          <Link href="/dashboard" className="text-[#888] transition-colors hover:text-white">
            New Project
          </Link>
          <span className="px-1.5 text-[#444]">/</span>
          <span className="font-medium text-white">Create Project</span>
        </p>
      </div>
    </div>
  );
}
