import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  
  const diffInMs = date.getTime() - new Date().getTime();
  const diffInMinutes = Math.round(diffInMs / (1000 * 60));
  
  if (Math.abs(diffInMinutes) < 60) {
    return rtf.format(diffInMinutes, "minute");
  }
  
  const diffInHours = Math.round(diffInMs / (1000 * 60 * 60));
  if (Math.abs(diffInHours) < 24) {
    return rtf.format(diffInHours, "hour");
  }
  
  const diffInDays = Math.round(diffInMs / (1000 * 60 * 60 * 24));
  return rtf.format(diffInDays, "day");
}
