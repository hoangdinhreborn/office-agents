"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Menu,
  Moon,
  Sun,
  Search,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { NotificationPopover } from "@/components/layout/notification-popover";
import { DeskhiveIcon } from "@/components/brand/deskhive-logo";
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
    <header className="h-14 border-b border-white/70 dark:border-white/10 bg-white/75 dark:bg-slate-900/75 backdrop-blur-2xl px-4 flex items-center justify-between z-30 flex-shrink-0 shadow-glass-sm transition-colors duration-200">
      <div className="flex items-center space-x-3">
        {/* Toggle Sidebar */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800/70 backdrop-blur-sm transition-all"
          title="Thu gọn / Mở rộng Sidebar (Ctrl+B)"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Brand Logo: Deskhive */}
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500/20 via-indigo-500/20 to-purple-500/20 border border-white/80 dark:border-white/15 flex items-center justify-center shadow-glass-sm backdrop-blur-md transition-transform hover:scale-105 duration-200">
            <DeskhiveIcon size={22} />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              Deskhive
              <span className="text-[10px] bg-indigo-500/15 text-indigo-700 border border-indigo-400/30 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800/80 px-1.5 py-0.2 rounded font-mono font-semibold shadow-xs backdrop-blur-sm">
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
          className="flex items-center space-x-2 bg-white/60 hover:bg-white/90 dark:bg-slate-800/60 dark:hover:bg-slate-800/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/70 dark:border-white/10 transition-all duration-200 shadow-glass-sm hover:shadow-glass hover:-translate-y-0.5 group"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-amber-500"
            }`}
          />
          <span className="font-mono text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white font-medium">
            {modelName}
          </span>
          <ChevronDown className="h-3 w-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-transform group-hover:translate-y-0.5" />
        </button>

        {/* Google Workspace status */}
        <div className="hidden sm:flex items-center space-x-1.5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/70 dark:border-white/10 shadow-glass-sm text-slate-600 dark:text-slate-300">
          <Sparkles className="h-3.5 w-3.5 text-rose-500" />
          <span className="font-medium">Gmail & Cal</span>
        </div>

        {/* Command Palette Trigger (Ctrl+K) */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center space-x-2 bg-white/60 hover:bg-white/90 dark:bg-slate-800/60 dark:hover:bg-slate-800/90 backdrop-blur-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 px-3 py-1.5 rounded-xl border border-white/70 dark:border-white/10 text-xs transition-all duration-200 shadow-glass-sm hover:shadow-glass hover:-translate-y-0.5"
        >
          <Search className="h-3.5 w-3.5 text-indigo-500" />
          <span>Tìm kiếm...</span>
          <kbd className="bg-white/80 dark:bg-slate-900/80 text-[10px] px-1.5 py-0.5 rounded-md border border-white/80 dark:border-white/10 font-mono text-slate-600 dark:text-slate-400 shadow-xs">
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
          className="text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800/70 backdrop-blur-sm transition-all"
          title="Đổi giao diện Sáng / Tối"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-400/20 via-indigo-500/20 to-purple-500/20 backdrop-blur-md flex items-center justify-center text-slate-800 dark:text-slate-200 text-xs font-bold border border-white/80 dark:border-white/15 shadow-glass-sm">
          U
        </div>
      </div>
    </header>
  );
}
