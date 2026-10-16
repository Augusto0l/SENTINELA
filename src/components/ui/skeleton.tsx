// shadcn/ui skeleton adapted to SENTINELA. MIT.
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export default function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden="true" {...props} />;
}
