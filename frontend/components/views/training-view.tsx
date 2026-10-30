"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BrainCircuit,
  Play,
  RotateCw,
  Download,
  Terminal,
  ThumbsUp,
  ThumbsDown,
  Award,
} from "lucide-react";
import { FeedbackRecord, FeedbackStats } from "@/types";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function TrainingView() {
  const [stats, setStats] = useState<FeedbackStats>({
    total_feedback: 0,
    positive_count: 0,
    negative_count: 0,
    with_corrections_count: 0,
  });
  const [history, setHistory] = useState<FeedbackRecord[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingLogs, setTrainingLogs] = useState<string[]>([
    "> Sẵn sàng thu nhận dữ liệu feedback con người. Nhấn [Train DPO Ngay] để kích hoạt chu trình.",
  ]);

  const loadData = async () => {
    try {
      const st = await api.getFeedbackStats();
      setStats(st);
      const hist = await api.getFeedbackList(1, 10);
      setHistory(hist.items || []);
    } catch (e: any) {
      console.warn("Lỗi tải thông số training:", e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTrainDPO = async () => {
    setIsTraining(true);
    setTrainingLogs((prev) => [
      ...prev,
      `> [${new Date().toLocaleTimeString()}] Bắt đầu tiến trình DPO LoRA Fine-Tuning...`,
    ]);

    try {
      const res = await api.triggerDpoTrain(3);
      if (res.logs) {
        res.logs.forEach((l: any) => {
          setTrainingLogs((prev) => [
            ...prev,
            `[${l.timestamp}] Epoch ${l.epoch} | Loss: ${l.loss} | Tiến độ: ${l.progress_bar}`,
          ]);
        });
      }
      setTrainingLogs((prev) => [
        ...prev,
        `> [${new Date().toLocaleTimeString()}] ✅ ${res.message || "Huấn luyện DPO thành công!"}`,
      ]);
      toast.success("Đã hoàn tất tiến trình DPO LoRA Fine-Tuning!");
      loadData();
    } catch (e: any) {
      setTrainingLogs((prev) => [...prev, `> ❌ Lỗi: ${e.message}`]);
      toast.error(e.message || "Lỗi huấn luyện DPO");
    } finally {
      setIsTraining(false);
    }
  };

  const handleReloadModel = async () => {
    try {
      const res = await api.reloadOllamaModel();
      toast.success(res.message || "Đã tải lại mô hình vào Ollama!");
    } catch (e: any) {
      toast.error(e.message || "Lỗi tải lại mô hình");
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/60 dark:border-white/10 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-purple-600" />
            <span>Huấn Luyện Học Tăng Cường (Reinforcement Learning / DPO)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Thu thập phản hồi con người (Human Feedback), tạo cặp chosen/rejected và fine-tune mô hình cục bộ.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            onClick={handleTrainDPO}
            disabled={isTraining}
            className="bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white rounded-xl gap-2 shadow-md shadow-purple-500/25 border border-white/20 active:scale-[0.97]"
          >
            <Play className={`h-4 w-4 ${isTraining ? "animate-spin" : ""}`} />
            <span>{isTraining ? "Đang Train..." : "Train DPO Ngay"}</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleReloadModel}
            className="rounded-xl gap-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50"
          >
            <RotateCw className="h-4 w-4" />
            <span>Reload Model</span>
          </Button>

          <a
            href="/api/feedback?limit=500"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-white/70 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-slate-800 shadow-glass-sm transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            <span>JSONL</span>
          </a>
        </div>
      </div>

      {/* 4 Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="rounded-2xl shadow-glass-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-medium">Tổng Lượt Phản Hồi</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {stats.total_feedback}
            </h3>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-emerald-400/40 dark:border-emerald-900/60 shadow-glass-sm bg-emerald-500/15 dark:bg-emerald-950/20 backdrop-blur-xl">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
              <ThumbsUp className="h-3.5 w-3.5" />
              <span>Đánh Giá Tích Cực (👍)</span>
            </p>
            <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {stats.positive_count}
            </h3>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-rose-400/40 dark:border-rose-900/60 shadow-glass-sm bg-rose-500/15 dark:bg-rose-950/20 backdrop-blur-xl">
          <CardContent className="p-4">
            <p className="text-xs text-rose-700 dark:text-rose-400 font-medium flex items-center gap-1">
              <ThumbsDown className="h-3.5 w-3.5" />
              <span>Đánh Giá Tiêu Cực (👎)</span>
            </p>
            <h3 className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              {stats.negative_count}
            </h3>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-purple-400/40 dark:border-purple-900/60 shadow-glass-sm bg-purple-500/15 dark:bg-purple-950/20 backdrop-blur-xl">
          <CardContent className="p-4">
            <p className="text-xs text-purple-700 dark:text-purple-400 font-medium flex items-center gap-1">
              <Award className="h-3.5 w-3.5" />
              <span>DPO Pairs (Chosen)</span>
            </p>
            <h3 className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
              {stats.with_corrections_count}
            </h3>
          </CardContent>
        </Card>
      </div>

      {/* Live Training Console */}
      <Card className="rounded-2xl shadow-glass-sm font-mono overflow-hidden">
        <CardHeader className="pb-2.5 border-b border-white/60 dark:border-white/10">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-purple-500" />
              <span>Tiến Trình Huấn Luyện (Training Log)</span>
            </CardTitle>
            <Badge variant="purple" className="text-[10px]">
              {isTraining ? "Đang chạy" : "Sẵn sàng"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <div className="bg-slate-950/90 text-slate-200 p-4 rounded-xl text-xs space-y-1.5 min-h-[140px] max-h-60 overflow-y-auto border border-white/10 backdrop-blur-xl shadow-inner">
            {trainingLogs.map((log, idx) => (
              <p key={idx} className="leading-relaxed">
                {log}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Human Feedback History Table */}
      <Card className="rounded-2xl shadow-glass-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-white/60 dark:border-white/10">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Lịch Sử Phản Hồi Đã Ghi Nhận
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md text-slate-500 uppercase text-[10px] tracking-wider border-b border-white/60 dark:border-white/10">
                <tr>
                  <th className="p-3.5 pl-5">Tác Tử</th>
                  <th className="p-3.5">Prompt Người Dùng</th>
                  <th className="p-3.5">Response Ban Đầu</th>
                  <th className="p-3.5">Câu Trả Lời Sửa (Chosen)</th>
                  <th className="p-3.5">Rating</th>
                  <th className="p-3.5 pr-5 text-right">Thời Gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40 dark:divide-white/5 text-slate-700 dark:text-slate-200">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Chưa có phản hồi nào được ghi nhận. Hãy bấm 👍/👎 hoặc sửa câu trả lời trong Chat.
                    </td>
                  </tr>
                ) : (
                  history.map((it) => (
                    <tr key={it.id} className="hover:bg-white/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 pl-5">
                        <Badge variant="purple" className="font-mono text-[9px]">
                          {it.agent_type}
                        </Badge>
                      </td>
                      <td className="p-3.5 max-w-xs truncate text-slate-900 dark:text-white font-medium">
                        {it.prompt}
                      </td>
                      <td className="p-3.5 max-w-xs truncate text-slate-500">
                        {it.response}
                      </td>
                      <td className="p-3.5 max-w-xs truncate text-amber-600 dark:text-amber-400 font-medium">
                        {it.corrected_response || "(Chưa sửa)"}
                      </td>
                      <td className="p-3.5">
                        <Badge
                          variant={it.rating > 0 ? "emerald" : "rose"}
                          className="font-bold text-[10px]"
                        >
                          {it.rating > 0 ? "+1" : it.rating}
                        </Badge>
                      </td>
                      <td className="p-3.5 pr-5 text-right text-slate-400 font-mono text-[11px]">
                        {it.created_at ? it.created_at.substring(0, 16).replace("T", " ") : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
