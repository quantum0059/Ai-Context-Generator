"use client";

import { Circle, Diamond, Hexagon, Database, Square, Star } from "lucide-react";

const legendItems = [
  { icon: Circle, label: "Platform", filled: true },
  { icon: Hexagon, label: "Product", filled: false },
  { icon: Database, label: "Database", filled: false },
  { icon: Diamond, label: "Service", filled: false },
  { icon: Square, label: "External", filled: false },
  { icon: Star, label: "Feature", filled: false },
];

export function LegendPanel() {
  return (
    <div
      className="absolute left-6 top-20 z-10 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] p-4"
    >
      <div className="flex flex-col gap-2.5">
        {legendItems.map(({ icon: Icon, label, filled }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon
              className="size-4 text-[#888]"
              fill={filled ? "#888" : "none"}
            />
            <span className="text-[13px] text-[#888]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
