"use client";

import { useEffect, useState } from "react";

interface StatItem {
  value: number;
  suffix?: string;
  label: string;
}

const stats: StatItem[] = [
  { value: 24, label: "Total Files" },
  { value: 8, label: "Prompts" },
  { value: 6, label: "Data" },
  { value: 3, label: "Databases" },
  { value: 3.35, suffix: " MB", label: "Package Size" },
];

function useAnimatedCounter(target: number, duration: number = 800) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const startTime = performance.now();
    const isFloat = target % 1 !== 0;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = eased * target;
      setCurrent(isFloat ? parseFloat(value.toFixed(2)) : Math.round(value));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }, [target, duration]);

  return current;
}

function StatCell({ stat }: { stat: StatItem }) {
  const animated = useAnimatedCounter(stat.value);

  return (
    <div className="flex flex-col gap-1.5 bg-[#111111] px-5 py-5">
      <span className="text-[26px] font-bold leading-none text-white">
        {stat.suffix ? `${animated}${stat.suffix}` : animated}
      </span>
      <span className="text-[13px] text-[#888]">{stat.label}</span>
    </div>
  );
}

export function PackageStatsRow() {
  return (
    <div
      className="grid grid-cols-5 overflow-hidden rounded-xl"
      style={{ gap: "1px", background: "rgba(255,255,255,0.08)" }}
    >
      {stats.map((stat) => (
        <StatCell key={stat.label} stat={stat} />
      ))}
    </div>
  );
}
