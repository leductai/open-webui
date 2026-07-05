import * as React from "react";
import {cn} from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-[linear-gradient(135deg,#19546a_0%,#2d7b87_100%)] text-white shadow-[0_12px_28px_rgba(29,94,110,0.28)] hover:-translate-y-0.5",
  secondary: "bg-[rgba(255,248,238,0.92)] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] hover:bg-white",
  ghost: "bg-transparent text-[hsl(var(--muted-foreground))] hover:bg-[rgba(255,255,255,0.75)] hover:text-[hsl(var(--foreground))]",
  danger: "bg-[linear-gradient(135deg,#bf4b39_0%,#dd7151_100%)] text-white shadow-[0_12px_28px_rgba(191,75,57,0.24)] hover:-translate-y-0.5"
};

export function Button({className, variant = "primary", ...props}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
