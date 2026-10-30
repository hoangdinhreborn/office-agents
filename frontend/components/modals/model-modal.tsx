"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SystemStatus } from "@/types";
import { Cpu, RotateCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface ModelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: SystemStatus | null;
  onReloadSuccess?: () => void;
}

export function ModelModal({ open, onOpenChange, status, onReloadSuccess }: ModelModalProps) {
  const isOnline = status?.ollama_status?.connected ?? false;
  const modelName = status?.ollama_status?.target_model || "deepseek-r1:8b";

  const handleReload = async () => {
    try {
      const res = await api.reloadOllamaModel();
      toast.success(res.message || "Đã nạp lại mô hình vào Ollama!");
      if (onReloadSuccess) onReloadSuccess();
    } catch (e: any) {
      toast.error(e.message || "Lỗi tải lại mô hình");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border border-white/70 dark:border-white/15 bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl shadow-glass-lg p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white">
            <Cpu className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span>Thông Tin Mô Hình Local LLM</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Thông số kỹ thuật và trạng thái kết nối máy chủ Ollama chạy On-Premise.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300 py-2">
          <div className="flex justify-between items-center py-1.5 border-b border-white/60 dark:border-white/10">
            <span className="text-slate-500">Tên mô hình:</span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {modelName}
            </span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-white/60 dark:border-white/10">
            <span className="text-slate-500">Trạng thái kết nối:</span>
            <span className="flex items-center gap-1.5 font-medium">
              {isOnline ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Sẵn sàng (Online)</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">Chưa kết nối</span>
                </>
              )}
            </span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-white/60 dark:border-white/10">
            <span className="text-slate-500">VRAM ước tính:</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
              ~5.8 GB - 18.2 GB
            </span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-white/60 dark:border-white/10">
            <span className="text-slate-500">Context Window:</span>
            <span className="font-mono text-slate-900 dark:text-white font-semibold">
              32,768 tokens
            </span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-white/60 dark:border-white/10">
            <span className="text-slate-500">Quantization:</span>
            <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold">
              Q4_K_M
            </span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-white/60 dark:border-white/10">
            <span className="text-slate-500">Ollama Base URL:</span>
            <span className="font-mono text-slate-400">http://localhost:11434</span>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            Đóng
          </Button>
          <Button
            onClick={handleReload}
            className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl shadow-md shadow-indigo-500/25 border border-white/20 active:scale-[0.97] gap-1.5"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>Tải Lại Mô Hình</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
