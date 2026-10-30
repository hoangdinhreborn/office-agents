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
import { Input, Textarea } from "@/components/ui/input";
import { emailSchema, EmailFormValues } from "@/lib/schemas";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Send, Mail, User } from "lucide-react";

interface SendEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SendEmailModal({ open, onOpenChange, onSuccess }: SendEmailModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      to: "",
      subject: "",
      body: "",
    },
  });

  const onSubmit = async (values: EmailFormValues) => {
    try {
      await api.sendEmail({
        to: values.to,
        subject: values.subject,
        body: values.body,
      });
      toast.success(`Đã gửi email thành công tới ${values.to}!`);
      reset();
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Lỗi gửi email");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border border-white/70 dark:border-white/15 bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl shadow-glass-lg p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <Send className="h-4 w-4 text-rose-500" />
            <span>Soạn & Gửi Email Qua Gmail API</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Gửi email trực tiếp qua tài khoản Google Workspace được xác thực OAuth 2.0.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <User className="h-3 w-3 text-slate-400" />
              <span>Người nhận (Email) <span className="text-rose-500">*</span></span>
            </label>
            <Input
              type="email"
              placeholder="recipient@company.com"
              {...register("to")}
              className="text-xs rounded-xl"
            />
            {errors.to && (
              <p className="text-[11px] text-rose-500">{errors.to.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Mail className="h-3 w-3 text-slate-400" />
              <span>Tiêu đề thư <span className="text-rose-500">*</span></span>
            </label>
            <Input
              placeholder="VD: Báo cáo tổng kết tiến độ dự án quý..."
              {...register("subject")}
              className="text-xs rounded-xl"
            />
            {errors.subject && (
              <p className="text-[11px] text-rose-500">{errors.subject.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nội dung thư <span className="text-rose-500">*</span>
            </label>
            <Textarea
              rows={6}
              placeholder="Nhập nội dung thư tại đây..."
              {...register("body")}
              className="text-xs rounded-xl font-sans"
            />
            {errors.body && (
              <p className="text-[11px] text-rose-500">{errors.body.message}</p>
            )}
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
              className="bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl shadow-md shadow-rose-500/25 border border-white/20 active:scale-[0.97] gap-1.5"
            >
              <Send className="h-3 w-3" />
              <span>{isSubmitting ? "Đang gửi..." : "Gửi Thư"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
