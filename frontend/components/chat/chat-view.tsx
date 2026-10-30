"use client";

import React, { useEffect, useRef, useState } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Composer } from "@/components/chat/composer";
import { ArrowDown, FileText, Mail, Calendar, Lightbulb } from "lucide-react";
import { ChatMessageItem } from "@/types";

interface ChatViewProps {
  messages: ChatMessageItem[];
  isLoading: boolean;
  onSendMessage: (message: string, file?: File, agent?: string) => Promise<void>;
  onQuickPrompt: (promptText: string) => void;
  onOpenCritique: (prompt: string, response: string) => void;
  selectedAgent: string;
  onSelectAgent: (agent: string) => void;
  attachedFile: File | null;
  onAttachFile: (file: File | null) => void;
}

export function ChatView({
  messages,
  isLoading,
  onSendMessage,
  onQuickPrompt,
  onOpenCritique,
  selectedAgent,
  onSelectAgent,
  attachedFile,
  onAttachFile,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Auto-scroll when messages update
  const scrollToBottom = (smooth = true) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isLoading]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distance = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distance > 150);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
      {/* Scrollable Chat Messages Container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4 overscroll-contain"
      >
        {messages.length === 0 ? (
          /* Welcome Card with Quick Starters */
          <div className="flex items-start space-x-3 max-w-3xl">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-xs shadow-md shadow-indigo-500/25 border border-white/30 backdrop-blur-md">
              AI
            </div>
            <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl border border-white/70 dark:border-white/10 p-5 rounded-2xl rounded-tl-sm shadow-glass space-y-3 flex-1 text-slate-800 dark:text-slate-200">
              <div className="space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                  Xin chào! Tôi là Trợ lý Multi-Agent hoạt động hoàn toàn tại Local.
                  <span className="text-[10px] bg-indigo-500/15 text-indigo-700 border border-indigo-400/30 dark:bg-indigo-950/60 dark:text-indigo-400 dark:border-indigo-800 px-2 py-0.5 rounded-full font-mono font-medium shadow-xs">
                    01 Local LLM
                  </span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Tôi có thể hỗ trợ bạn tóm tắt tài liệu PDF 4 phần, đọc/lọc email mới từ sếp qua Gmail API v1, đồng bộ sự kiện lên Google Calendar và đề xuất ma trận giải pháp sự cố:
                </p>
              </div>

              {/* 4 Quick Prompt Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                <button
                  onClick={() => onQuickPrompt("Tóm tắt tài liệu PDF và trích xuất các hạn chót quan trọng")}
                  className="text-left p-3.5 rounded-xl bg-white/60 hover:bg-sky-50/70 border border-white/70 hover:border-sky-300 dark:bg-slate-800/60 dark:hover:bg-slate-800 dark:border-white/10 dark:hover:border-sky-500/40 backdrop-blur-md shadow-glass-sm hover:shadow-glass hover:-translate-y-0.5 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400">
                    <FileText className="h-4 w-4 text-sky-500" />
                    <span>Tóm tắt PDF 4 phần</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Trích xuất tóm tắt điều hành và các mốc deadline quan trọng.
                  </p>
                </button>

                <button
                  onClick={() => onQuickPrompt("Đọc email mới từ sếp, nếu có sự cố hãy đề xuất giải pháp xử lý")}
                  className="text-left p-3.5 rounded-xl bg-white/60 hover:bg-rose-50/70 border border-white/70 hover:border-rose-300 dark:bg-slate-800/60 dark:hover:bg-slate-800 dark:border-white/10 dark:hover:border-rose-500/40 backdrop-blur-md shadow-glass-sm hover:shadow-glass hover:-translate-y-0.5 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100 group-hover:text-rose-600 dark:group-hover:text-rose-400">
                    <Mail className="h-4 w-4 text-rose-500" />
                    <span>Đọc Gmail & Sự cố</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Lọc whitelist người gửi và đề xuất giải pháp xử lý ngay.
                  </p>
                </button>

                <button
                  onClick={() => onQuickPrompt("Tạo lịch họp nghiệm thu dự án lúc 15h30 chiều mai, nhắc trước 30 phút")}
                  className="text-left p-3.5 rounded-xl bg-white/60 hover:bg-emerald-50/70 border border-white/70 hover:border-emerald-300 dark:bg-slate-800/60 dark:hover:bg-slate-800 dark:border-white/10 dark:hover:border-emerald-500/40 backdrop-blur-md shadow-glass-sm hover:shadow-glass hover:-translate-y-0.5 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                    <Calendar className="h-4 w-4 text-emerald-500" />
                    <span>Google Calendar</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Trích xuất lịch họp và tạo file .ics kèm chuông nhắc trước.
                  </p>
                </button>

                <button
                  onClick={() => onQuickPrompt("Đề xuất ma trận giải pháp khắc phục sự cố máy chủ thanh toán bị timeout")}
                  className="text-left p-3.5 rounded-xl bg-white/60 hover:bg-amber-50/70 border border-white/70 hover:border-amber-300 dark:bg-slate-800/60 dark:hover:bg-slate-800 dark:border-white/10 dark:hover:border-amber-500/40 backdrop-blur-md shadow-glass-sm hover:shadow-glass hover:-translate-y-0.5 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    <span>Advisor Agent</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Root Cause và giải pháp 3 cấp độ (Khẩn cấp, Trung hạn, Dài hạn).
                  </p>
                </button>
              </div>
            </div>
          </div>
        ) : (
          messages.map((m, idx) => {
            const prevUserPrompt = idx > 0 && messages[idx - 1].role === "user" ? messages[idx - 1].content : undefined;
            return (
              <MessageBubble
                key={m.id || idx}
                role={m.role}
                content={m.content}
                thinkingProcess={m.thinking_process}
                agentsInvoked={m.agents_invoked}
                originalPrompt={prevUserPrompt}
                onOpenCritique={onOpenCritique}
              />
            );
          })
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center space-x-3 max-w-3xl">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-violet-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-md shadow-indigo-500/25 border border-white/30 backdrop-blur-md">
              AI
            </div>
            <div className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl border border-white/70 dark:border-white/10 rounded-2xl rounded-tl-sm p-4 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2.5 shadow-glass-sm">
              <span className="flex h-2.5 w-2.5 rounded-full bg-indigo-600 animate-ping" />
              <span>Đang suy luận và xử lý qua Multi-Agent Orchestrator...</span>
            </div>
          </div>
        )}
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-24 right-8 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl text-slate-700 dark:text-slate-200 p-2.5 rounded-full shadow-glass-lg border border-white/70 dark:border-white/15 text-xs transition-all hover:bg-white hover:-translate-y-0.5 z-20"
          title="Cuộn xuống dưới cùng"
        >
          <ArrowDown className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </button>
      )}

      {/* Zone 4: Adaptive Composer */}
      <Composer
        onSendMessage={onSendMessage}
        isLoading={isLoading}
        selectedAgent={selectedAgent}
        onSelectAgent={onSelectAgent}
        attachedFile={attachedFile}
        onAttachFile={onAttachFile}
      />
    </div>
  );
}
