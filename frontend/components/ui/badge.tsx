import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-indigo-600 text-white shadow hover:bg-indigo-700",
        secondary: "border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
        destructive: "border-transparent bg-rose-500 text-white shadow hover:bg-rose-600",
        outline: "text-slate-950 dark:text-slate-50 border-slate-200 dark:border-slate-800",
        emerald: "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
        amber: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
        purple: "border-purple-500/30 bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300",
        sky: "border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
        rose: "border-rose-500/30 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
