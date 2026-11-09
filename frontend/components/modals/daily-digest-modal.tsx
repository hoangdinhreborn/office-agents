"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  FileDown,
  Eye,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Calendar,
  Sparkles,
} from "lucide-react";
import { DailyDigestResponse } from "@/types";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface DailyDigestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DailyDigestModal({ open, onOpenChange }: DailyDigestModalProps) {
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [digest, setDigest] = useState<DailyDigestResponse | null>(null);

  const handleFetchDigest = async () => {
    setIsLoading(true);
    try {
      const data = await api.getDailyDigest(targetDate);
      setDigest(data);
      toast.success(`Đã tổng hợp thành công ${data.total_emails} email ngày ${targetDate}!`);
    } catch (e: any) {
      toast.error(e.message || "Lỗi tải báo cáo tổng hợp");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const res = await api.exportDailyDigestPDF(targetDate);
      toast.success(`Đã xuất báo cáo PDF thành công (${res.filename})!`);
      // Open PDF in new tab / download
      window.open(res.download_url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Lỗi xuất báo cáo PDF");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-2xl shadow-glass-lg">
        <DialogHeader className="border-b border-white/60 dark:border-white/10 pb-3">
          <DialogTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-500" />
            <span>Báo Cáo Tổng Hợp Email Trong Ngày (Daily Digest)</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            AI tự động gom nhóm email theo danh mục (nộp bài, học vụ, thắc mắc...) và xuất báo cáo PDF chuẩn hóa.
          </DialogDescription>
        </DialogHeader>

        {/* Action Toolbar */}
        <div className="bg-slate-50/80 dark:bg-slate-950/60 p-3 rounded-xl border border-white/60 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600 dark:text-slate-300">Chọn ngày:</span>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="h-8 text-xs rounded-xl w-36"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleFetchDigest}
              disabled={isLoading}
              className="h-8 text-xs rounded-xl gap-1.5"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{isLoading ? "Đang tải..." : "Xem Báo Cáo"}</span>
            </Button>

            <Button
              size="sm"
              onClick={handleExportPDF}
              disabled={isExporting}
              className="h-8 text-xs rounded-xl gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-sm"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>{isExporting ? "Đang xuất..." : "Xuất File PDF"}</span>
            </Button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1 text-xs">
          {!digest ? (
            <div className="p-12 text-center text-slate-400 border border-dashed rounded-xl space-y-2">
              <FileCheck className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-700" />
              <p>Bấm &quot;Xem Báo Cáo&quot; để tổng hợp hoặc &quot;Xuất File PDF&quot; để tải tài liệu.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-purple-500/10 border border-purple-400/30 dark:bg-purple-950/40 dark:border-purple-800/60 p-3 rounded-xl text-center">
                  <div className="text-[11px] text-purple-600 dark:text-purple-300 font-medium">Tổng Email</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                    {digest.total_emails}
                  </div>
                </div>

                <div className="bg-rose-500/10 border border-rose-400/30 dark:bg-rose-950/40 dark:border-rose-800/60 p-3 rounded-xl text-center">
                  <div className="text-[11px] text-rose-600 dark:text-rose-300 font-medium">Khẩn Cấp</div>
                  <div className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                    {digest.urgent_count}
                  </div>
                </div>

                <div className="bg-sky-500/10 border border-sky-400/30 dark:bg-sky-950/40 dark:border-sky-800/60 p-3 rounded-xl text-center">
                  <div className="text-[11px] text-sky-600 dark:text-sky-300 font-medium">File PDF Đính Kèm</div>
                  <div className="text-lg font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                    {digest.pdf_count}
                  </div>
                </div>

                <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-center">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Ngày Báo Cáo</div>
                  <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 mt-1">
                    {digest.target_date}
                  </div>
                </div>
              </div>

              {/* Category Pills */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Object.entries(digest.categories).map(([catName, list]) => (
                  <div
                    key={catName}
                    className="p-2.5 rounded-xl border border-white/60 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 text-center"
                  >
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{catName}</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {list.length}
                    </div>
                  </div>
                ))}
              </div>

              {/* Executive Summary */}
              <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 dark:bg-purple-950/20 space-y-1.5">
                <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  <span>Tổng Quan Tình Hình Trong Ngày:</span>
                </h4>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {digest.executive_summary}
                </p>
              </div>

              {/* Action Items */}
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-2">
                <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Danh Sách Công Việc Cần Xử Lý (Action Items):</span>
                </h4>
                <ul className="space-y-1.5">
                  {digest.action_items && digest.action_items.length > 0 ? (
                    digest.action_items.map((act, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-400">Đã giải quyết toàn bộ các đầu việc trong ngày.</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
