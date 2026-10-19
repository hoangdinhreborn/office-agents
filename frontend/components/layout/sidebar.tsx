"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquareQuote,
  FileText,
  Mail,
  CalendarDays,
  CheckSquare,
  BrainCircuit,
  Plus,
  Trash2,
  Code2,
  ShieldCheck,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
} from "lucide-react";
import { ChatSessionSummary } from "@/types";

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  pendingTasksCount: number;
  readyTrain: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onQuickSelectAgent: (agent: string) => void;
}

export function Sidebar({
  currentView,
  onSelectView,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  pendingTasksCount,
  readyTrain,
  collapsed,
  onToggleCollapse,
  onQuickSelectAgent,
}: SidebarProps) {
  if (collapsed) {
    return (
      <aside className="w-14 border-r border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 flex flex-col justify-between py-3 items-center z-20 flex-shrink-0">
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
            title="Mở rộng Sidebar (Ctrl+B)"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>

          <div className="w-8 border-t border-slate-200 dark:border-slate-800 my-1" />

          <Button
            variant={currentView === "chat" ? "default" : "ghost"}
            size="icon"
            onClick={() => onSelectView("chat")}
            title="Hội Thoại (Chat) - Ctrl+1"
          >
            <MessageSquareQuote className="h-4 w-4" />
          </Button>

          <Button
            variant={currentView === "docs" ? "default" : "ghost"}
            size="icon"
            onClick={() => onSelectView("docs")}
            title="Tài Liệu (Docs) - Ctrl+2"
          >
            <FileText className="h-4 w-4" />
          </Button>

          <Button
            variant={currentView === "inbox" ? "default" : "ghost"}
            size="icon"
            onClick={() => onSelectView("inbox")}
            title="Hộp Thư (Inbox) - Ctrl+3"
          >
            <Mail className="h-4 w-4" />
          </Button>

          <Button
            variant={currentView === "calendar" ? "default" : "ghost"}
            size="icon"
            onClick={() => onSelectView("calendar")}
            title="Lịch Hẹn (Calendar) - Ctrl+4"
          >
            <CalendarDays className="h-4 w-4" />
          </Button>

          <Button
            variant={currentView === "tasks" ? "default" : "ghost"}
            size="icon"
            onClick={() => onSelectView("tasks")}
            title="Công Việc (Tasks) - Ctrl+5"
            className="relative"
          >
            <CheckSquare className="h-4 w-4" />
            {pendingTasksCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
                {pendingTasksCount}
              </span>
            )}
          </Button>

          <Button
            variant={currentView === "training" ? "default" : "ghost"}
            size="icon"
            onClick={() => onSelectView("training")}
            title="Huấn Luyện (RL) - Ctrl+6"
          >
            <BrainCircuit className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewSession}
            title="Cuộc trò chuyện mới"
            className="text-indigo-600 dark:text-indigo-400"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 border-r border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 flex flex-col justify-between z-20 flex-shrink-0 transition-all">
      <div className="p-3.5 space-y-4 overflow-y-auto flex-1">
        {/* TẦNG 1: PRIMARY NAVIGATION */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Chức Năng Chính
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              onClick={onToggleCollapse}
              title="Thu gọn Sidebar (Ctrl+B)"
            >
              <PanelLeftClose className="h-3 w-3" />
            </Button>
          </div>

          <nav className="space-y-0.5">
            <button
              onClick={() => onSelectView("chat")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                currentView === "chat"
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <MessageSquareQuote className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Hội Thoại (Chat)</span>
              </span>
              <kbd className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1 py-0.2 rounded font-mono">
                ^1
              </kbd>
            </button>

            <button
              onClick={() => onSelectView("docs")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                currentView === "docs"
                  ? "bg-sky-50 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-sky-500" />
                <span>Tài Liệu (Docs)</span>
              </span>
              <kbd className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1 py-0.2 rounded font-mono">
                ^2
              </kbd>
            </button>

            <button
              onClick={() => onSelectView("inbox")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                currentView === "inbox"
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-rose-500" />
                <span>Hộp Thư (Inbox)</span>
              </span>
              <kbd className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1 py-0.2 rounded font-mono">
                ^3
              </kbd>
            </button>

            <button
              onClick={() => onSelectView("calendar")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                currentView === "calendar"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <CalendarDays className="h-4 w-4 text-emerald-500" />
                <span>Lịch Hẹn (Calendar)</span>
              </span>
              <kbd className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1 py-0.2 rounded font-mono">
                ^4
              </kbd>
            </button>

            <button
              onClick={() => onSelectView("tasks")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                currentView === "tasks"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <CheckSquare className="h-4 w-4 text-amber-500" />
                <span>Công Việc (Tasks)</span>
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 px-1.5 py-0.2 rounded-full font-mono font-bold">
                {pendingTasksCount}
              </span>
            </button>

            <button
              onClick={() => onSelectView("training")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                currentView === "training"
                  ? "bg-purple-50 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <BrainCircuit className="h-4 w-4 text-purple-500" />
                <span>Huấn Luyện (RL)</span>
              </span>
              {readyTrain && (
                <Badge variant="purple" className="px-1.5 py-0 text-[9px]">
                  Ready
                </Badge>
              )}
            </button>
          </nav>
        </div>

        {/* TẦNG 2: AGENTS SHORTCUT */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
            Tác Tử Chuyên Trách
          </p>
          <nav className="space-y-0.5">
            <button
              onClick={() => onQuickSelectAgent("summarizer")}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition"
            >
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span>Summarizer Agent</span>
            </button>
            <button
              onClick={() => onQuickSelectAgent("advisor")}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Advisor Agent</span>
            </button>
            <button
              onClick={() => onQuickSelectAgent("email")}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition"
            >
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Email Reader Agent</span>
            </button>
            <button
              onClick={() => onQuickSelectAgent("scheduler")}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Scheduler Agent</span>
            </button>
          </nav>
        </div>

        {/* TẦNG 3: CHAT SESSIONS */}
        <div className="flex flex-col min-h-0 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Phiên Trò Chuyện
            </p>
            <button
              onClick={onNewSession}
              className="text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-semibold flex items-center gap-1"
              title="Tạo cuộc trò chuyện mới"
            >
              <Plus className="h-3 w-3" />
              <span>Mới</span>
            </button>
          </div>

          <div className="space-y-1 text-xs max-h-48 overflow-y-auto pr-1">
            {sessions.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-slate-400 italic">
                Chưa có phiên chat nào
              </div>
            ) : (
              sessions.map((s) => {
                const isActive = s.id === activeSessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      onSelectView("chat");
                      onSelectSession(s.id);
                    }}
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition ${
                      isActive
                        ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate flex-1 min-w-0 pr-1">
                      <MessageSquareQuote
                        className={`h-3.5 w-3.5 flex-shrink-0 ${
                          isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"
                        }`}
                      />
                      <span className="truncate" title={s.title}>
                        {s.title}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {s.message_count}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(s.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-0.5 transition"
                        title="Xóa phiên"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="p-3.5 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40 text-xs">
        <span className="text-slate-500 text-[11px] flex items-center gap-1.5 font-medium">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Local On-Prem
        </span>
        <a
          href="/docs"
          target="_blank"
          rel="noreferrer"
          className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
          title="Swagger API Documentation"
        >
          <Code2 className="h-4 w-4" />
        </a>
      </div>
    </aside>
  );
}
