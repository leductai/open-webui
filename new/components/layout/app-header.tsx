import Link from "next/link";
import {ArrowLeft, BookOpenText} from "lucide-react";
import {Button} from "@/components/ui/button";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  badges?: Array<{label: string}>;
  actions?: React.ReactNode;
};

export function AppHeader({title, subtitle, backHref, backLabel, badges, actions}: AppHeaderProps) {
  return (
    <header className="glass-panel shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {backHref ? (
          <Link href={backHref}>
            <Button variant="ghost" className="h-10 w-10 shrink-0 rounded-xl p-0" aria-label={backLabel ?? "Back"}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#fff2e3_0%,#efc998_100%)] text-[hsl(var(--accent-foreground))]">
            <BookOpenText className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-[hsl(var(--foreground))] md:text-xl">{title}</h1>
          {subtitle ? <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {badges?.map((badge) => (
          <span
            key={badge.label}
            className="rounded-full bg-[rgba(255,248,238,0.92)] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--muted-foreground))]"
          >
            {badge.label}
          </span>
        ))}
        {actions}
      </div>
    </header>
  );

}
