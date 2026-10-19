"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Send,
  Search,
  Sparkles,
  CalendarPlus,
  Lightbulb,
  Clock,
  User,
  Inbox as InboxIcon,
} from "lucide-react";
import { ProcessedEmail } from "@/types";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface InboxViewProps {
  onQuickPrompt: (promptText: string) => void;
  onOpenSendModal: () => void;
}

export function InboxView({ onQuickPrompt, onOpenSendModal }: InboxViewProps) {
  const [folder, setFolder] = useState("INBOX");
  const [whitelist, setWhitelist] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [emails, setEmails] = useState<ProcessedEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<ProcessedEmail | null>(null);

  const loadInitialRawEmails = async () => {
    try {
      const rawList = await api.fetchRawEmails({
        folder_name: folder,
        unread_only: unreadOnly,
        limit: 10,
      });
      if (rawList && rawList.length > 0) {
        const mapped: ProcessedEmail[] = rawList.map((m: any) => ({
          id: m.id,
          sender: m.sender_name ? `${m.sender_name} <${m.sender_email}>` : m.sender_email,
          subject: m.subject,
          received_time: m.received_time,
          urgency: "Chưa phân tích AI",
          summary: m.body || "(Không có nội dung văn bản)",
        }));
        setEmails(mapped);
        setSelectedEmail(mapped[0]);
      }
    } catch (e) {
      // Keep empty list if unable to fetch raw emails initially
    }
  };

  useEffect(() => {
    loadInitialRawEmails();
  }, []);

  const handleScanEmails = async () => {
    setIsScanning(true);
    try {
      const senders = whitelist
        ? whitelist.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const res = await api.analyzeEmails({
        folder_name: folder,
        allowed_senders: senders,
        unread_only: unreadOnly,
        limit: 5,
      });
      if (res && res.length > 0) {
        const mapped: ProcessedEmail[] = res.map((r: any, idx: number) => ({
          ...r,
          id: r.id || r.message_id || `email-${idx}`,
        }));
        setEmails(mapped);
        setSelectedEmail(mapped[0]);
        toast.success(`Đã quét và phân tích AI ${mapped.length} email.`);
      } else {
        toast.info("Không có email nào thỏa mãn bộ lọc hiện tại.");
      }
    } catch (e: any) {
      toast.error(e.message || "Lỗi quét email");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50/50 dark:bg-slate-950/50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-rose-500" />
            <span>Hộp Thư & Quét Email Gmail API v1</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Lọc Whitelist người gửi an toàn, đọc tóm tắt AI và soạn thư bảo mật chuẩn OAuth 2.0.
          </p>
        </div>

        <Button
          onClick={onOpenSendModal}
          className="bg-rose-600 hover:bg-rose-500 text-white rounded-xl gap-2 shadow-sm"
        >
          <Send className="h-4 w-4" />
          <span>Soạn Thư Mới</span>
        </Button>
      </div>

      {/* Filter Toolbar */}
      <Card className="rounded-2xl border-slate-200/80 dark:border-slate-800 p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Nhãn Gmail:</span>
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="INBOX">INBOX</option>
              <option value="STARRED">STARRED</option>
              <option value="IMPORTANT">IMPORTANT</option>
              <option value="SENT">SENT</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <span className="text-slate-500 font-medium">Whitelist:</span>
            <Input
              placeholder="boss@company.com, ceo@corp.vn"
              value={whitelist}
              onChange={(e) => setWhitelist(e.target.value)}
              className="h-8 text-xs rounded-xl"
            />
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300">
            <Checkbox
              checked={unreadOnly}
              onCheckedChange={(c) => setUnreadOnly(!!c)}
            />
            <span>Chỉ chưa đọc</span>
          </label>

          <Button
            size="sm"
            onClick={handleScanEmails}
            disabled={isScanning}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl gap-1.5 h-8 text-xs"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{isScanning ? "Đang quét..." : "Quét Email"}</span>
          </Button>
        </div>
      </Card>

      {/* 2-Column Email Reader */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Email List (2 cols) */}
        <Card className="lg:col-span-2 rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex justify-between items-center">
              <span>Danh Sách Email</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {emails.length} thư
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
            {emails.map((em) => {
              const isSelected = selectedEmail?.id === em.id;
              return (
                <div
                  key={em.id}
                  onClick={() => setSelectedEmail(em)}
                  className={`p-3.5 rounded-xl border text-xs cursor-pointer transition space-y-1.5 ${
                    isSelected
                      ? "bg-rose-50/70 border-rose-300 dark:bg-rose-950/60 dark:border-rose-900"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {em.subject}
                    </span>
                    <Badge
                      variant={em.urgency === "Khẩn cấp" ? "rose" : "secondary"}
                      className="text-[9px] flex-shrink-0"
                    >
                      {em.urgency}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="truncate flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{em.sender}</span>
                    </span>
                    <span className="font-mono flex-shrink-0">{em.received_time}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Right Column: Email Detail & Action Toolbar (3 cols) */}
        <Card className="lg:col-span-3 rounded-2xl">
          {selectedEmail ? (
            <>
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                      {selectedEmail.subject}
                    </CardTitle>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <span>Người gửi:</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {selectedEmail.sender}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{selectedEmail.received_time}</span>
                    </p>
                  </div>

                  <Badge
                    variant={selectedEmail.urgency === "Khẩn cấp" ? "rose" : "secondary"}
                    className="text-[10px]"
                  >
                    {selectedEmail.urgency}
                  </Badge>
                </div>

                {/* 3 AI Quick Action Triggers */}
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onQuickPrompt(
                        `Tóm tắt chi tiết email sau và đưa ra hành động cần làm:\nTiêu đề: ${selectedEmail.subject}\nNội dung: ${selectedEmail.summary}`
                      )
                    }
                    className="gap-1.5 text-xs rounded-xl text-indigo-600 hover:text-indigo-700"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                    <span>📝 Tóm Tắt AI</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onQuickPrompt(
                        `Lên lịch cuộc họp từ email '${selectedEmail.subject}': ${selectedEmail.calendar_hint || selectedEmail.summary}`
                      )
                    }
                    className="gap-1.5 text-xs rounded-xl text-emerald-600 hover:text-emerald-700"
                  >
                    <CalendarPlus className="h-3.5 w-3.5 text-emerald-500" />
                    <span>📅 Tạo Lịch</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onQuickPrompt(
                        `Đề xuất ma trận giải pháp xử lý sự cố nêu trong email: ${selectedEmail.issue_description || selectedEmail.subject}`
                      )
                    }
                    className="gap-1.5 text-xs rounded-xl text-amber-600 hover:text-amber-700"
                  >
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                    <span>💡 Đề Xuất Sự Cố</span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Nội Dung Thư & Phân Tích:
                </p>
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap min-h-[220px]">
                  {selectedEmail.summary}
                </div>
              </CardContent>
            </>
          ) : (
            <div className="p-16 text-center text-slate-400 space-y-2">
              <InboxIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700" />
              <p className="text-xs">Chọn một email bên trái để xem nội dung chi tiết.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
