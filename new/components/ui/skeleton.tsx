import {cn} from "@/lib/utils";

export function Skeleton({className}: {className?: string}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[1.5rem] bg-[linear-gradient(90deg,rgba(236,227,214,0.9)_0%,rgba(250,246,239,1)_50%,rgba(236,227,214,0.9)_100%)] bg-[length:200%_100%]",
        className
      )}
    />
  );
}
