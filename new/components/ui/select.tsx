import * as React from "react";
import {cn} from "@/lib/utils";

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-11 min-w-0 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-3 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition",
        "focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]",
        props.className
      )}
    />
  );
}
