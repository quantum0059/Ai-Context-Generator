"use client";

import { Monitor, Diamond, Database, Hexagon, Star } from "lucide-react";

const dependencyItems = [
  {
    icon: Monitor,
    label: "Interface → Chat",
    description: "Sends prompts & displays responses",
  },
  {
    icon: Diamond,
    label: "Chat → OpenAI",
    description: "Processes requests via AI models",
  },
  {
    icon: Database,
    label: "AI → Database",
    description: "Stores conversations & user data",
  },
  {
    icon: Hexagon,
    label: "Payments → Database",
    description: "Saves transactions & user plans",
  },
  {
    icon: Star,
    label: "Portal → All",
    description: "Configures & monitors components",
  },
];

export function DependenciesPanel() {
  return (
    <div
      className="absolute right-6 top-20 z-10 w-[220px] rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] p-5"
    >
      <h3 className="mb-4 text-sm font-semibold text-white">Dependencies</h3>
      <div className="flex flex-col gap-3.5">
        {dependencyItems.map(({ icon: Icon, label, description }) => (
          <div key={label} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-white" />
            <div>
              <div className="text-[13px] font-semibold text-white">{label}</div>
              <div className="mt-0.5 text-xs leading-[1.4] text-[#888]">{description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
