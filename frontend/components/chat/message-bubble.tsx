"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  ThumbsUp,
  ThumbsDown,
  PenSquare,
  Copy,
  Check,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface MessageBubbleProps {
  role: "user" | "ai";
  content: string;
  thinkingProcess?: string;
  agentsInvoked?: string[];
  originalPrompt?: string;
  onOpenCritique: (prompt: string, response: string) => void;
}

export function MessageBubble({
  role,
  content,
  thinkingProcess,
  agentsInvoked = [],
  originalPrompt,
  onOpenCritique,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [rated, setRated] = useState<number | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Đã sao chép nội dung");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Không thể sao chép");
    }
  };

  const handleRating = async (rating: number) => {
    try {
      await api.submitFeedback({
        agent_type: agentsInvoked[0] || "router",
        prompt: originalPrompt || "Yêu cầu",
        response: content,
        rating,
      });
      setRated(rating);
      toast.success(rating > 0 ? "Đã ghi nhận phản hồi hữu ích (👍)" : "Đã ghi nhận phản hồi (👎)");
    } catch (e: any) {
      toast.error(e.message || "Lỗi ghi nhận phản hồi");
    }
  };

  if (role === "user") {
    return (
      <div className="flex items-start justify-end space-x-2.5 max-w-3xl ml-auto animate-in fade-in-50 duration-200">
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-xs leading-relaxed shadow-md shadow-indigo-600/25 border border-white/20">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
        <div className="w-7 h-7 rounded-xl bg-indigo-500/15 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 border border-indigo-400/30 dark:border-indigo-800 shadow-glass-sm backdrop-blur-md">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start space-x-3 max-w-3xl animate-in fade-in-50 duration-200">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-violet-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-md shadow-indigo-500/25 border border-white/30 backdrop-blur-md mt-0.5">
        AI
      </div>

      <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl border border-white/70 dark:border-white/10 rounded-2xl rounded-tl-sm p-4 text-xs text-slate-800 dark:text-slate-200 shadow-glass flex-1 space-y-3">
        {/* Agent Badges */}
        {agentsInvoked && agentsInvoked.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {agentsInvoked.map((ag) => (
              <Badge key={ag} variant="purple" className="font-mono text-[9px] px-2 py-0.2">
                {ag}
              </Badge>
            ))}
          </div>
        )}

        {/* DeepSeek-R1 / Reasoning Thinking Process (<think>) */}
        {thinkingProcess && (
          <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 dark:border-amber-900/50 dark:bg-amber-950/30 backdrop-blur-md overflow-hidden shadow-xs">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-amber-800 dark:text-amber-300 font-semibold select-none hover:bg-amber-500/15 transition-colors"
            >
              <span className="flex items-center gap-1.5 text-[11px]">
                <Brain className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>Quá trình suy luận của mô hình</span>
              </span>
              {showThinking ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showThinking && (
              <div className="px-3 pb-3 text-[11px] font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap border-t border-amber-300/30 dark:border-amber-900/40 pt-2 leading-relaxed max-h-60 overflow-y-auto">
                {thinkingProcess}
              </div>
            )}
          </div>
        )}

        {/* Markdown Content */}
        <div className="prose prose-xs dark:prose-invert max-w-none leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>

        {/* RL Feedback & Utilities Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/60 dark:border-white/10 text-slate-400 text-xs">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => handleRating(1)}
              className={`p-1.5 rounded-xl hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all ${
                rated === 1 ? "text-emerald-500 font-bold bg-emerald-500/15 border border-emerald-400/30 shadow-xs" : "text-slate-400 hover:text-emerald-500"
              }`}
              title="Hữu ích (Thumbs Up)"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleRating(-1)}
              className={`p-1.5 rounded-xl hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all ${
                rated === -1 ? "text-rose-500 font-bold bg-rose-500/15 border border-rose-400/30 shadow-xs" : "text-slate-400 hover:text-rose-500"
              }`}
              title="Chưa đạt (Thumbs Down)"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onOpenCritique(originalPrompt || "Yêu cầu", content)}
              className="p-1.5 rounded-xl hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-400 hover:text-amber-500 transition-all"
              title="Chỉnh sửa câu trả lời chuẩn (DPO Preference Pair)"
            >
              <PenSquare className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="p-1.5 rounded-xl hover:bg-white/80 dark:hover:bg-slate-800/80 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
            title="Sao chép nội dung"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
