"use client";

import { useEffect, useState } from "react";

interface StatItem {
  value: number;
  suffix?: string;
  label: string;
}

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

export function PackageStatsRow({ files = {} }: { files?: Record<string, string> }) {
  const filePaths = Object.keys(files);
  const totalFiles = filePaths.length;
  
  const totalSizeStr = filePaths.reduce((acc, path) => acc + (files[path]?.length || 0), 0);
  const totalSizeMB = parseFloat((totalSizeStr / 1024 / 1024).toFixed(2));

  let promptFiles = 0;
  let dataFiles = 0;
  let codeFiles = 0;

  for (const p of filePaths) {
    if (p.includes("prompts/")) promptFiles++;
    else if (p.includes("data/") || p.endsWith(".json") || p.endsWith(".csv")) dataFiles++;
    else codeFiles++;
  }

  const stats: StatItem[] = [
    { value: totalFiles, label: "Total Files" },
    { value: promptFiles, label: "Prompts" },
    { value: dataFiles, label: "Data" },
    { value: codeFiles, label: "Code Files" },
    { value: totalSizeMB, suffix: " MB", label: "Package Size" },
  ];

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

