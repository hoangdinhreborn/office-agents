import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-xs font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md shadow-indigo-500/25 border border-white/20",
        destructive:
          "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-md shadow-rose-500/25 border border-white/20",
        outline:
          "border border-white/70 dark:border-white/15 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md text-slate-800 dark:text-slate-100 hover:bg-white/90 dark:hover:bg-slate-800/80 shadow-glass-sm hover:shadow-glass hover:border-white/90",
        secondary:
          "bg-white/60 hover:bg-white/80 dark:bg-slate-800/60 dark:hover:bg-slate-700/80 backdrop-blur-md text-slate-800 dark:text-slate-100 border border-white/60 dark:border-white/10 shadow-glass-sm",
        ghost:
          "hover:bg-white/60 dark:hover:bg-slate-800/60 backdrop-blur-sm text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white",
        link: "text-indigo-600 dark:text-indigo-400 underline-offset-4 hover:underline",
        emerald:
          "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/25 border border-white/20",
        amber:
          "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-md shadow-amber-500/25 border border-white/20",
        purple:
          "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-md shadow-purple-500/25 border border-white/20",
        rose:
          "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-md shadow-rose-500/25 border border-white/20",
        glass:
          "backdrop-blur-md bg-white/70 dark:bg-slate-800/70 border border-white/70 dark:border-white/15 text-slate-800 dark:text-slate-100 hover:bg-white/90 dark:hover:bg-slate-800 shadow-glass-sm hover:shadow-glass",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3",
        lg: "h-11 rounded-xl px-6 text-sm",
        icon: "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
