import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-indigo-400/40 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 backdrop-blur-md shadow-xs",
        secondary:
          "border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 backdrop-blur-md shadow-xs",
        destructive:
          "border-rose-400/40 bg-rose-500/15 text-rose-700 dark:text-rose-300 backdrop-blur-md shadow-xs",
        outline:
          "text-slate-800 dark:text-slate-200 border-white/70 dark:border-white/15 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm",
        emerald:
          "border-emerald-400/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 backdrop-blur-md shadow-xs",
        amber:
          "border-amber-400/40 bg-amber-500/15 text-amber-700 dark:text-amber-300 backdrop-blur-md shadow-xs",
        purple:
          "border-purple-400/40 bg-purple-500/15 text-purple-700 dark:text-purple-300 backdrop-blur-md shadow-xs",
        sky:
          "border-sky-400/40 bg-sky-500/15 text-sky-700 dark:text-sky-300 backdrop-blur-md shadow-xs",
        rose:
          "border-rose-400/40 bg-rose-500/15 text-rose-700 dark:text-rose-300 backdrop-blur-md shadow-xs",
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
