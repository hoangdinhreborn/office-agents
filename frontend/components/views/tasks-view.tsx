"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckSquare,
  Plus,
  Clock,
  ListTodo,
  CheckCircle2,
  Trash2,
  Calendar,
} from "lucide-react";
import { TaskItem } from "@/types";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface TasksViewProps {
  onOpenAddModal: () => void;
  onTasksCountChange?: (count: number) => void;
}

export function TasksView({ onOpenAddModal, onTasksCountChange }: TasksViewProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0 });
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await api.getTasks(
        statusFilter,
        sourceFilter === "all" ? undefined : sourceFilter
      );
      setTasks(data.items || []);
      setStats(data.stats);
      if (onTasksCountChange) {
        onTasksCountChange(data.stats.pending);
      }
    } catch (e: any) {
      toast.error(e.message || "Lỗi tải công việc");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [sourceFilter, statusFilter]);

  const handleToggleStatus = async (taskId: string, isCompleted: boolean) => {
    try {
      await api.updateTask(taskId, {
        status: isCompleted ? "completed" : "pending",
      });
      loadTasks();
      toast.success(isCompleted ? "Đã đánh dấu hoàn thành" : "Đã chuyển về đang chờ");
    } catch (e: any) {
      toast.error(e.message || "Lỗi cập nhật trạng thái");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.deleteTask(taskId);
      loadTasks();
      toast.info("Đã xóa công việc");
    } catch (e: any) {
      toast.error(e.message || "Lỗi xóa công việc");
    }
  };

  // Group tasks into Today vs Other
  const todayStr = new Date().toISOString().substring(0, 10);
  const todayTasks = tasks.filter(
    (t) => t.due_date && t.due_date.substring(0, 10) === todayStr
  );
  const otherTasks = tasks.filter(
    (t) => !t.due_date || t.due_date.substring(0, 10) !== todayStr
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/60 dark:border-white/10 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-amber-500" />
            <span>Danh Sách Công Việc (Tasks)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tự động tổng hợp và phân loại việc cần làm từ Email sếp, văn bản PDF và hội thoại.
          </p>
        </div>

        <Button
          onClick={onOpenAddModal}
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl gap-2 shadow-md shadow-amber-500/25 border border-white/20 active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" />
          <span>Thêm Công Việc Mới</span>
        </Button>
      </div>

      {/* 3 Summary Statistic Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl shadow-glass-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">Tổng Số Việc</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {stats.total}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-white/60 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-glass-sm backdrop-blur-md">
              <ListTodo className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-amber-400/40 dark:border-amber-900/60 shadow-glass-sm bg-amber-500/15 dark:bg-amber-950/20 backdrop-blur-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Đang Chờ Xử Lý</p>
              <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-300 mt-1">
                {stats.pending}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 dark:bg-amber-900/60 border border-amber-400/30 flex items-center justify-center text-amber-600 dark:text-amber-300 shadow-glass-sm backdrop-blur-md">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-emerald-400/40 dark:border-emerald-900/60 shadow-glass-sm bg-emerald-500/15 dark:bg-emerald-950/20 backdrop-blur-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Đã Hoàn Thành</p>
              <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-300 mt-1">
                {stats.completed}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 dark:bg-emerald-900/60 border border-emerald-400/30 flex items-center justify-center text-emerald-600 dark:text-emerald-300 shadow-glass-sm backdrop-blur-md">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="rounded-2xl p-3 shadow-glass-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-medium mr-1">Lọc nguồn:</span>
            {[
              { id: "all", label: "Tất cả" },
              { id: "email", label: "📧 Email" },
              { id: "pdf", label: "📄 PDF" },
              { id: "prompt", label: "💬 Prompt" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSourceFilter(f.id)}
                className={`px-3 py-1 rounded-xl font-medium transition-all duration-200 ${
                  sourceFilter === f.id
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-glass-sm border border-white/20"
                    : "bg-white/60 dark:bg-slate-800/60 border border-white/70 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/90"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-medium">Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white/70 dark:bg-slate-900/70 border border-white/70 dark:border-white/10 rounded-xl px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300 backdrop-blur-md focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-glass-sm"
            >
              <option value="pending">Đang chờ</option>
              <option value="completed">Đã hoàn thành</option>
              <option value="all">Tất cả trạng thái</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Tasks Grouped Container */}
      <div className="space-y-6">
        {/* Today Group */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]" />
            <span>Hôm Nay (Today)</span>
          </h3>

          <div className="space-y-2">
            {todayTasks.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-white/70 dark:border-white/15 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm text-xs text-slate-400 text-center">
                Không có công việc nào cần nộp hôm nay.
              </div>
            ) : (
              todayTasks.map((t) => (
                <div
                  key={t.id}
                  className="p-3.5 rounded-2xl bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl border border-white/70 dark:border-white/10 flex items-center justify-between text-xs hover:border-white/90 dark:hover:border-white/20 hover:shadow-glass hover:-translate-y-0.5 transition-all duration-200 shadow-glass-sm"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Checkbox
                      checked={t.status === "completed"}
                      onCheckedChange={(c) => handleToggleStatus(t.id, !!c)}
                    />
                    <span
                      className={`font-medium truncate ${
                        t.status === "completed"
                          ? "line-through text-slate-400 dark:text-slate-500"
                          : "text-slate-900 dark:text-white"
                      }`}
                    >
                      {t.title}
                    </span>
                    <Badge variant="secondary" className="font-mono text-[9px] uppercase">
                      {t.source_type}
                    </Badge>
                  </div>

                  <div className="flex items-center space-x-3 text-slate-400">
                    {t.due_date && (
                      <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{t.due_date.substring(11, 16)}</span>
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteTask(t.id)}
                      className="hover:text-rose-500 p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-slate-800/60 transition"
                      title="Xóa công việc"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Other / Upcoming Group */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
            <span>Kế Hoạch Khác & Sắp Tới</span>
          </h3>

          <div className="space-y-2">
            {otherTasks.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-white/70 dark:border-white/15 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm text-xs text-slate-400 text-center">
                Không có công việc nào khác.
              </div>
            ) : (
              otherTasks.map((t) => (
                <div
                  key={t.id}
                  className="p-3.5 rounded-2xl bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl border border-white/70 dark:border-white/10 flex items-center justify-between text-xs hover:border-white/90 dark:hover:border-white/20 hover:shadow-glass hover:-translate-y-0.5 transition-all duration-200 shadow-glass-sm"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Checkbox
                      checked={t.status === "completed"}
                      onCheckedChange={(c) => handleToggleStatus(t.id, !!c)}
                    />
                    <span
                      className={`font-medium truncate ${
                        t.status === "completed"
                          ? "line-through text-slate-400 dark:text-slate-500"
                          : "text-slate-900 dark:text-white"
                      }`}
                    >
                      {t.title}
                    </span>
                    <Badge variant="secondary" className="font-mono text-[9px] uppercase">
                      {t.source_type}
                    </Badge>
                  </div>

                  <div className="flex items-center space-x-3 text-slate-400">
                    {t.due_date && (
                      <span className="font-mono text-[11px] flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{t.due_date.substring(0, 10)}</span>
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteTask(t.id)}
                      className="hover:text-rose-500 p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-slate-800/60 transition"
                      title="Xóa công việc"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
