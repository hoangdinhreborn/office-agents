"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white/85 dark:group-[.toaster]:bg-slate-900/85 group-[.toaster]:backdrop-blur-2xl group-[.toaster]:text-slate-950 dark:group-[.toaster]:text-slate-50 group-[.toaster]:border-white/70 dark:group-[.toaster]:border-white/15 group-[.toaster]:shadow-[0_16px_40px_rgba(0,0,0,0.12)] rounded-2xl text-xs font-sans",
          description: "group-[.toast]:text-slate-500 dark:group-[.toast]:text-slate-400",
          actionButton:
            "group-[.toast]:bg-gradient-to-r group-[.toast]:from-indigo-600 group-[.toast]:to-violet-600 group-[.toast]:text-white shadow-md shadow-indigo-500/20 rounded-xl",
          cancelButton:
            "group-[.toast]:bg-white/60 dark:group-[.toast]:bg-slate-800/60 group-[.toast]:text-slate-700 dark:group-[.toast]:text-slate-300 rounded-xl",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
