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
import { eventSchema, EventFormValues } from "@/lib/schemas";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CalendarPlus, MapPin, Clock } from "lucide-react";

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateEventModal({ open, onOpenChange, onSuccess }: CreateEventModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      start_time: "",
      end_time: "",
      location: "",
      reminder_minutes: 30,
    },
  });

  const onSubmit = async (values: EventFormValues) => {
    try {
      const res = await api.createCalendarEvent({
        title: values.title,
        start_time: new Date(values.start_time).toISOString(),
        end_time: values.end_time ? new Date(values.end_time).toISOString() : undefined,
        location: values.location,
        reminder_minutes: values.reminder_minutes,
      });
      if (res?.cloud_synced) {
        toast.success("Đã tạo sự kiện và đồng bộ lên Google Calendar!");
      } else {
        toast.success(res?.message || "Đã tạo sự kiện lịch trình (.ics)!");
      }
      reset();
      onOpenChange(false);
      onSuccess();
      window.dispatchEvent(new CustomEvent("calendar-event-created"));
    } catch (e: any) {
      toast.error(e.message || "Lỗi tạo sự kiện");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border border-white/70 dark:border-white/15 bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl shadow-glass-lg p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <CalendarPlus className="h-4 w-4 text-emerald-500" />
            <span>Tạo Sự Kiện Google Calendar</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Tạo sự kiện chuẩn RFC-5545 và đồng bộ tự động lên tài khoản Google Workspace.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Tiêu đề cuộc họp / Sự kiện <span className="text-rose-500">*</span>
            </label>
            <Input
              placeholder="VD: Họp rà soát tiến độ dự án..."
              {...register("title")}
              className="text-xs rounded-xl"
            />
            {errors.title && (
              <p className="text-[11px] text-rose-500">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Clock className="h-3 w-3 text-emerald-500" />
                <span>Bắt đầu <span className="text-rose-500">*</span></span>
              </label>
              <Input
                type="datetime-local"
                {...register("start_time")}
                className="text-xs rounded-xl"
              />
              {errors.start_time && (
                <p className="text-[11px] text-rose-500">{errors.start_time.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Clock className="h-3 w-3 text-slate-400" />
                <span>Kết thúc</span>
              </label>
              <Input
                type="datetime-local"
                {...register("end_time")}
                className="text-xs rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-slate-400" />
                <span>Địa điểm / Link</span>
              </label>
              <Input
                placeholder="VD: Phòng A / Google Meet"
                {...register("location")}
                className="text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nhắc trước (phút)
              </label>
              <select
                {...register("reminder_minutes")}
                className="w-full bg-white/70 dark:bg-slate-950/70 border border-white/70 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 backdrop-blur-md focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-glass-sm"
              >
                <option value="15">15 phút trước</option>
                <option value="30">30 phút trước</option>
                <option value="60">1 tiếng trước</option>
                <option value="120">2 tiếng trước</option>
              </select>
            </div>
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
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-md shadow-emerald-500/25 border border-white/20 active:scale-[0.97]"
            >
              {isSubmitting ? "Đang lưu..." : "Lên Lịch Ngay"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
