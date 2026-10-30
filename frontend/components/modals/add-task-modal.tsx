"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { taskSchema, TaskFormValues } from "@/lib/schemas";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckSquare } from "lucide-react";

interface AddTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddTaskModal({ open, onOpenChange, onSuccess }: AddTaskModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      priority: "medium",
      source_type: "prompt",
    },
  });

  const onSubmit = async (values: TaskFormValues) => {
    try {
      await api.createTask({
        title: values.title,
        due_date: values.due_date ? new Date(values.due_date).toISOString() : undefined,
        priority: values.priority,
        source_type: values.source_type,
      });
      toast.success("Đã tạo công việc mới thành công!");
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Lỗi tạo công việc");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border border-white/70 dark:border-white/15 bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl shadow-glass-lg p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <CheckSquare className="h-4 w-4 text-amber-500" />
            <span>Thêm Công Việc Mới</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Nhập chi tiết nhiệm vụ cần thực hiện, hạn hoàn thành và mức độ ưu tiên.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Tiêu đề công việc <span className="text-rose-500">*</span>
            </label>
            <Input
              placeholder="VD: Gửi báo cáo tài chính quý cho ban điều hành..."
              {...register("title")}
              className="text-xs rounded-xl"
            />
            {errors.title && (
              <p className="text-[11px] text-rose-500">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Hạn hoàn thành (Deadline)
            </label>
            <Input
              type="datetime-local"
              {...register("due_date")}
              className="text-xs rounded-xl"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Mức độ ưu tiên
            </label>
            <select
              {...register("priority")}
              className="w-full bg-white/70 dark:bg-slate-950/70 border border-white/70 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 backdrop-blur-md focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-glass-sm"
            >
              <option value="medium">Bình thường (Medium)</option>
              <option value="high">Cao (High - Khẩn cấp)</option>
              <option value="low">Thấp (Low)</option>
            </select>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl shadow-md shadow-amber-500/25 border border-white/20 active:scale-[0.97]"
            >
              {isSubmitting ? "Đang tạo..." : "Tạo Việc"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
