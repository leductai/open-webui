import * as React from "react";
import {cn} from "@/lib/utils";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-12 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-4 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition",
        "placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]",
        props.className
      )}
    />
  );
}
