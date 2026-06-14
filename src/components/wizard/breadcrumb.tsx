import Link from "next/link";

export function WizardBreadcrumb() {
  return (
    <div className="flex h-12 items-center border-b border-white/[0.08] bg-[#0A0A0A] px-4 sm:px-6">
      <p className="text-sm">
        <Link href="/dashboard" className="text-[#888] hover:text-white">
          New Project
        </Link>
        <span className="text-[#888]"> / </span>
        <span className="font-semibold text-white">Create Project</span>
      </p>
    </div>
  );
}
