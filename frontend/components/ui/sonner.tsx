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
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-slate-950 group-[.toaster]:border-slate-200 group-[.toaster]:shadow-lg dark:group-[.toaster]:bg-slate-900 dark:group-[.toaster]:text-slate-50 dark:group-[.toaster]:border-slate-800 rounded-2xl text-xs font-sans",
          description: "group-[.toast]:text-slate-500 dark:group-[.toast]:text-slate-400",
          actionButton:
            "group-[.toast]:bg-indigo-600 group-[.toast]:text-white dark:group-[.toast]:bg-indigo-600",
          cancelButton:
            "group-[.toast]:bg-slate-100 group-[.toast]:text-slate-500 dark:group-[.toast]:bg-slate-800",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
