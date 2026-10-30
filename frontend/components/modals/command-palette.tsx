"use client";

import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Search,
  MessageSquareQuote,
  FileText,
  Mail,
  CalendarDays,
  CheckSquare,
  BrainCircuit,
  CornerDownLeft,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAction: (action: string) => void;
}

export function CommandPalette({ open, onOpenChange, onSelectAction }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  const commands = [
    {
      id: "chat",
      label: "Mở Hội Thoại (Chat Workspace)",
      shortcut: "Ctrl 1",
      icon: MessageSquareQuote,
      color: "text-indigo-500",
    },
    {
      id: "docs",
      label: "Quản Lý Tài Liệu & Tóm Tắt PDF",
      shortcut: "Ctrl 2",
      icon: FileText,
      color: "text-sky-500",
    },
    {
      id: "inbox",
      label: "Đọc Hộp Thư & Soạn Gmail API",
      shortcut: "Ctrl 3",
      icon: Mail,
      color: "text-rose-500",
    },
    {
      id: "calendar",
      label: "Xem Lịch Trình & Quản Lý Nhắc Hẹn",
      shortcut: "Ctrl 4",
      icon: CalendarDays,
      color: "text-emerald-500",
    },
    {
      id: "tasks",
      label: "Danh Sách Việc Cần Làm (Tasks)",
      shortcut: "Ctrl 5",
      icon: CheckSquare,
      color: "text-amber-500",
    },
    {
      id: "training",
      label: "Huấn Luyện Học Tăng Cường (RL DPO)",
      shortcut: "Ctrl 6",
      icon: BrainCircuit,
      color: "text-purple-500",
    },
  ];

  const filtered = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden max-w-lg border border-white/70 dark:border-white/15 shadow-glass-lg rounded-2xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl">
        <div className="flex items-center border-b border-white/60 dark:border-white/10 px-4 py-3 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md">
          <Search className="h-4 w-4 text-indigo-500 mr-2.5" />
          <input
            type="text"
            placeholder="Gõ lệnh hoặc tìm kiếm chức năng..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            autoFocus
          />
          <kbd className="text-[10px] bg-white/80 dark:bg-slate-800/80 text-slate-500 px-1.5 py-0.5 rounded-lg border border-white/70 dark:border-white/10 font-mono shadow-xs">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1 text-xs">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-slate-400">Không tìm thấy lệnh phù hợp</div>
          ) : (
            filtered.map((cmd) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  onClick={() => {
                    onSelectAction(cmd.id);
                    onOpenChange(false);
                    setQuery("");
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/80 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:translate-x-0.5 transition-all duration-200 group text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className={`h-4 w-4 ${cmd.color}`} />
                    <span className="font-medium group-hover:text-slate-900 dark:group-hover:text-white">
                      {cmd.label}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <kbd className="text-[10px] bg-white/70 dark:bg-slate-800/70 text-slate-400 px-1.5 py-0.5 rounded-md border border-white/60 dark:border-white/10 font-mono shadow-2xs">
                      {cmd.shortcut}
                    </kbd>
                    <CornerDownLeft className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
