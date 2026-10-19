"use client";

import React, { useEffect } from "react";
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
import { Input, Textarea } from "@/components/ui/input";
import { critiqueSchema, CritiqueFormValues } from "@/lib/schemas";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { PenSquare, Sparkles } from "lucide-react";

interface CritiqueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
  initialResponse: string;
  onSuccess?: () => void;
}

export function CritiqueModal({
  open,
  onOpenChange,
  prompt,
  initialResponse,
  onSuccess,
}: CritiqueModalProps) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CritiqueFormValues>({
    resolver: zodResolver(critiqueSchema),
    defaultValues: {
      corrected_response: initialResponse || "",
      notes: "",
    },
  });

  useEffect(() => {
    if (initialResponse) {
      setValue("corrected_response", initialResponse);
    }
  }, [initialResponse, setValue]);

  const onSubmit = async (values: CritiqueFormValues) => {
    try {
      await api.submitFeedback({
        agent_type: "router",
        prompt: prompt || "Yêu cầu",
        response: initialResponse,
        corrected_response: values.corrected_response,
        rating: 1,
        feedback_notes: values.notes || undefined,
      });
      toast.success("Đã lưu cặp dữ liệu DPO (chosen vs rejected) thành công!");
      reset();
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Lỗi lưu phản hồi DPO");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <PenSquare className="h-4 w-4 text-purple-600" />
            <span>Chỉnh Sửa Câu Trả Lời (RL Training Pair)</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Tạo cặp dữ liệu so sánh (Candidate vs Chosen) phục vụ quá trình Fine-tuning DPO của mô hình Local.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-300">
              Câu hỏi ban đầu của bạn:
            </label>
            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 italic font-mono text-[11px]">
              {prompt || "..."}
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-300">
              Câu trả lời chuẩn theo ý bạn (Chosen target) <span className="text-rose-500">*</span>
            </label>
            <Textarea
              rows={6}
              {...register("corrected_response")}
              className="text-xs rounded-xl font-sans"
              placeholder="Nhập câu trả lời hoàn hảo bạn muốn mô hình học..."
            />
            {errors.corrected_response && (
              <p className="text-[11px] text-rose-500">{errors.corrected_response.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700 dark:text-slate-300">
              Góp ý thêm (Tùy chọn):
            </label>
            <Input
              placeholder="VD: Mô hình nên tính toán ngày họp chính xác hơn..."
              {...register("notes")}
              className="text-xs rounded-xl"
            />
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
              className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-xs gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Đang lưu..." : "Lưu Cặp DPO"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
