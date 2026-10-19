"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Menu,
  Moon,
  Sun,
  Search,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { NotificationPopover } from "@/components/layout/notification-popover";
import { SystemStatus, UpcomingEventsResponse } from "@/types";
import { useTheme } from "next-themes";

interface TopbarProps {
  status: SystemStatus | null;
  upcomingData: UpcomingEventsResponse | null;
  onRefreshNotifications: () => void;
  onNavigateToCalendar: () => void;
  onOpenModelModal: () => void;
  onOpenCommandPalette: () => void;
  onToggleSidebar: () => void;
}

export function Topbar({
  status,
  upcomingData,
  onRefreshNotifications,
  onNavigateToCalendar,
  onOpenModelModal,
  onOpenCommandPalette,
  onToggleSidebar,
}: TopbarProps) {
  const { theme, setTheme } = useTheme();
  const isOnline = status?.ollama_status?.connected ?? false;
  const modelName = status?.ollama_status?.target_model || "deepseek-r1:8b";

  return (
    <header className="h-14 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 flex items-center justify-between z-30 flex-shrink-0">
      <div className="flex items-center space-x-3">
        {/* Toggle Sidebar */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Thu gọn / Mở rộng Sidebar (Ctrl+B)"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Brand Logo */}
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              Local AI Assistant
              <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-400 dark:border-indigo-800 px-1.5 py-0.2 rounded font-mono font-semibold">
                v1.2
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Center: Agent Status & Model Chip */}
      <div className="flex items-center space-x-3 text-xs">
        {/* Model Trigger */}
        <button
          onClick={onOpenModelModal}
          className="flex items-center space-x-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 transition shadow-sm group"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            }`}
          />
          <span className="font-mono text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white font-medium">
            {modelName}
          </span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>

        {/* Google Workspace status */}
        <div className="hidden sm:flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-rose-500" />
          <span className="font-medium">Gmail & Cal</span>
        </div>

        {/* Command Palette Trigger (Ctrl+K) */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center space-x-2 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs transition"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Tìm kiếm...</span>
          <kbd className="bg-white dark:bg-slate-900 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-slate-500 shadow-xs">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Right: Notifications & Controls */}
      <div className="flex items-center space-x-2">
        <NotificationPopover
          data={upcomingData}
          onRefresh={onRefreshNotifications}
          onNavigateToCalendar={onNavigateToCalendar}
        />

        {/* Theme Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-slate-600 dark:text-slate-300"
          title="Đổi giao diện Sáng / Tối"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-300 dark:border-slate-600 shadow-xs">
          U
        </div>
      </div>
    </header>
  );
}
