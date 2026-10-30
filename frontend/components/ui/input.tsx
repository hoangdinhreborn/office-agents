import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-xl border border-white/70 dark:border-slate-800/80 bg-white/65 dark:bg-slate-950/45 backdrop-blur-md px-3 py-1 text-xs text-slate-900 shadow-inner transition-all duration-200 file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:bg-white/90 dark:focus-visible:bg-slate-950/70 focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-400/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 dark:placeholder:text-slate-500",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-xl border border-white/70 dark:border-slate-800/80 bg-white/65 dark:bg-slate-950/45 backdrop-blur-md px-3 py-2 text-xs text-slate-900 shadow-inner transition-all duration-200 placeholder:text-slate-400 focus-visible:outline-none focus-visible:bg-white/90 dark:focus-visible:bg-slate-950/70 focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-400/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 dark:placeholder:text-slate-500",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Input, Textarea };
