"use client";

import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Send,
  Paperclip,
  CalendarCheck2,
  X,
  Mic,
  MicOff,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface ComposerProps {
  onSendMessage: (message: string, file?: File, agent?: string) => Promise<void>;
  isLoading: boolean;
  selectedAgent: string;
  onSelectAgent: (agent: string) => void;
  attachedFile: File | null;
  onAttachFile: (file: File | null) => void;
}

export function Composer({
  onSendMessage,
  isLoading,
  selectedAgent,
  onSelectAgent,
  attachedFile,
  onAttachFile,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [hasScheduleHint, setHasScheduleHint] = useState(false);
  const [scheduleText, setScheduleText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }

    // Schedule detection
    const schedulePattern = /(họp|lịch|deadline|nhắc|lúc|ngày|thứ|chiều nay|sáng mai|hôm nay)/i;
    if (schedulePattern.test(val) && val.length > 8) {
      setHasScheduleHint(true);
      setScheduleText(val.substring(0, 60) + "...");
    } else {
      setHasScheduleHint(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if ((!text.trim() && !attachedFile) || isLoading) return;
    const msg = text.trim();
    const file = attachedFile;
    setText("");
    setHasScheduleHint(false);
    onAttachFile(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    await onSendMessage(msg, file || undefined, selectedAgent);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Vui lòng chọn tệp định dạng PDF");
        return;
      }
      onAttachFile(file);
      onSelectAgent("summarizer");
      toast.success(`Đã đính kèm ${file.name} (Tự chọn Summarizer Agent)`);
    }
  };

  // Web Speech API Voice Recognition
  const toggleVoice = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("Trình duyệt không hỗ trợ Web Speech API");
      return;
    }

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;

    if (!isListening) {
      recognition.start();
      setIsListening(true);
      toast.info("Đang lắng nghe giọng nói...");

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setText((prev) => (prev ? prev + " " + transcript : transcript));
        setIsListening(false);
        toast.success("Đã ghi nhận giọng nói");
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };
    }
  };

  return (
    <div className="p-3 md:p-4 border-t border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-10 flex-shrink-0">
      <div className="max-w-4xl mx-auto space-y-2">
        {/* Schedule Detected Alert */}
        {hasScheduleHint && (
          <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 px-3.5 py-1.5 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in">
            <span className="flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                Phát hiện yêu cầu đặt lịch: <b>{scheduleText}</b>
              </span>
            </span>
            <button
              onClick={() => setHasScheduleHint(false)}
              className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Attached PDF Chip */}
        {attachedFile && (
          <div className="flex items-center gap-2 bg-indigo-50 dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 px-3 py-1 rounded-xl text-xs text-indigo-900 dark:text-slate-200 w-fit">
            <Paperclip className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-medium">{attachedFile.name}</span>
            <button
              onClick={() => onAttachFile(null)}
              className="text-slate-400 hover:text-rose-500 ml-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Input Box */}
        <div className="relative rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 shadow-xs transition-all">
          <textarea
            ref={textareaRef}
            rows={2}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Hỏi gì cũng được... (Kéo thả PDF vào đây, gõ '@' để chọn ngữ cảnh)"
            className="w-full bg-transparent p-3.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none resize-none max-h-48"
          />

          {/* Action Toolbar */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1 text-xs">
            <div className="flex items-center space-x-1.5">
              {/* File Upload */}
              <label
                className="cursor-pointer text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 p-1.5 rounded-lg transition"
                title="Đính kèm tài liệu PDF"
              >
                <Paperclip className="h-4 w-4" />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {/* Agent Selector */}
              <select
                value={selectedAgent}
                onChange={(e) => onSelectAgent(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs rounded-xl px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="auto">🤖 Agent: Tự Động (Auto)</option>
                <option value="summarizer">📝 Summarizer Agent</option>
                <option value="advisor">💡 Advisor Agent</option>
                <option value="email">📧 Email Reader Agent</option>
                <option value="scheduler">📆 Scheduler Agent</option>
              </select>

              {/* Voice Input */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleVoice}
                className={`h-7 w-7 ${
                  isListening
                    ? "text-rose-500 animate-pulse bg-rose-50 dark:bg-rose-950/60"
                    : "text-slate-500 hover:text-indigo-600 dark:text-slate-400"
                }`}
                title="Nhập giọng nói (Web Speech API)"
              >
                {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {/* Send Button */}
            <Button
              onClick={handleSubmit}
              disabled={isLoading || (!text.trim() && !attachedFile)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-1.5 h-8 gap-1.5 shadow-md shadow-indigo-600/20"
            >
              <span>Gửi</span>
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
