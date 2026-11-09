"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  FolderTree,
  FileText,
  RotateCw,
  Plus,
  CheckSquare,
  Database,
  Eye,
  Code,
} from "lucide-react";
import { ProcessedEmail } from "@/types";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface InboxViewProps {
  onQuickPrompt: (promptText: string) => void;
  onOpenSendModal: () => void;
  onOpenFolderRulesModal?: () => void;
  onOpenDailyDigestModal?: () => void;
}

export function InboxView({
  onQuickPrompt,
  onOpenSendModal,
  onOpenFolderRulesModal,
  onOpenDailyDigestModal,
}: InboxViewProps) {
  const [folder, setFolder] = useState("INBOX");
  const [availableFolders, setAvailableFolders] = useState<string[]>([
    "INBOX",
    "IMPORTANT",
    "SENT",
    "STARRED",
    "UNREAD",
  ]);
  const [whitelist, setWhitelist] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isScanningMore, setIsScanningMore] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [emails, setEmails] = useState<ProcessedEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<ProcessedEmail | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "raw">("preview");

  // 1. Load real Gmail labels + custom folders
  const loadFolders = async () => {
    try {
      const data = await api.getEmailLabels();
      if (data && data.folders && data.folders.length > 0) {
        setAvailableFolders(data.folders);
      }
    } catch (e) {
      // Fallback
    }
  };

  // 2. Load already scanned emails from database so they NEVER disappear when leaving the tab!
  const loadSavedEmailsFromDB = async (targetFolder?: string): Promise<boolean> => {
    try {
      const f = targetFolder !== undefined ? targetFolder : folder;
      const res = await api.getProcessedEmails({
        folder: f && f !== "ALL" ? f : undefined,
        page: 1,
        page_size: 50,
      });
      if (res && res.items && res.items.length > 0) {
        setEmails(res.items);
        setSelectedEmail((prev) => {
          if (prev && res.items.some((i) => i.id === prev.id)) {
            return res.items.find((i) => i.id === prev.id) || res.items[0];
          }
          return res.items[0];
        });
        return true;
      }
    } catch (e) {
      console.warn("Chưa có email trong CSDL", e);
    }
    return false;
  };

  // 3. Fallback: load raw emails from Gmail if DB is completely empty for this folder
  const loadInitialRawEmails = async (targetFolder?: string) => {
    try {
      const f = targetFolder !== undefined ? targetFolder : folder;
      const res = await api.fetchRawEmails({
        folder_name: f,
        unread_only: unreadOnly,
        limit: 10,
      });
      const rawList = res.items || [];
      if (rawList.length > 0) {
        const mapped: ProcessedEmail[] = rawList.map((m: any) => ({
          id: m.id,
          sender: m.sender_name ? `${m.sender_name} <${m.sender_email}>` : m.sender_email,
          sender_name: m.sender_name,
          sender_email: m.sender_email,
          subject: m.subject,
          received_time: m.received_time,
          folder: m.folder || f,
          urgency: "Chưa phân tích AI",
          summary: m.body || "(Không có nội dung văn bản)",
          has_attachments: m.has_attachments,
          pdf_filename: m.attachments && m.attachments[0] ? m.attachments[0] : null,
        }));
        setEmails(mapped);
        setSelectedEmail(mapped[0]);
        setNextPageToken(res.next_page_token || null);
      } else {
        setEmails([]);
        setSelectedEmail(null);
      }
    } catch (e) {
      // Keep empty
    }
  };

  const handleFolderChange = async (newFolder: string) => {
    setFolder(newFolder);
    setNextPageToken(null);
    const hasSaved = await loadSavedEmailsFromDB(newFolder);
    if (!hasSaved) {
      await loadInitialRawEmails(newFolder);
    }
  };

  useEffect(() => {
    loadFolders();
    loadSavedEmailsFromDB("INBOX").then((hasSaved) => {
      if (!hasSaved) {
        loadInitialRawEmails("INBOX");
      }
    });
  }, []);

  // 4. Scan initial 10 emails with AI & PERSIST TO DB
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
        limit: 10,
      });
      const items = res.items || [];
      if (items.length > 0) {
        setEmails(items);
        setSelectedEmail(items[0]);
        setNextPageToken(res.next_page_token || null);
        toast.success(`Đã quét, phân tích AI và lưu ${items.length} email vào cơ sở dữ liệu!`);
      } else {
        toast.info("Không có email nào thỏa mãn bộ lọc hiện tại.");
      }
    } catch (e: any) {
      toast.error(e.message || "Lỗi quét email");
    } finally {
      setIsScanning(false);
    }
  };

  // 5. Scan Next 10 Emails ("Quét Tiếp") & PERSIST TO DB
  const handleScanMore = async () => {
    setIsScanningMore(true);
    try {
      const senders = whitelist
        ? whitelist.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const res = await api.analyzeEmails({
        folder_name: folder,
        allowed_senders: senders,
        unread_only: unreadOnly,
        limit: 10,
        page_token: nextPageToken || undefined,
      });
      const newItems = res.items || [];
      if (newItems.length > 0) {
        setEmails((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const filtered = newItems.filter((it) => !existingIds.has(it.id));
          return [...prev, ...filtered];
        });
        setNextPageToken(res.next_page_token || null);
        toast.success(`Đã quét thêm và lưu ${newItems.length} email vào cơ sở dữ liệu!`);
      } else {
        toast.info("Đã quét hết toàn bộ email trong hộp thư.");
        setNextPageToken(null);
      }
    } catch (e: any) {
      toast.error(e.message || "Lỗi quét tiếp");
    } finally {
      setIsScanningMore(false);
    }
  };

  // 6. Trigger Background Poller
  const handleTriggerPoll = async () => {
    setIsPolling(true);
    try {
      toast.info("Đang kích hoạt chu kỳ quét ngầm Outbound...");
      await api.triggerEmailPollNow();
      toast.success("Đã hoàn thành chu kỳ quét email!");
      await loadSavedEmailsFromDB();
    } catch (e: any) {
      toast.error(e.message || "Lỗi quét ngầm");
    } finally {
      setIsPolling(false);
    }
  };

  // 7. Save Email As Task into Database
  const handleSaveAsTask = async () => {
    if (!selectedEmail) return;
    try {
      const isUrgent = selectedEmail.urgency === "Khẩn cấp";
      const isHigh = selectedEmail.urgency === "Cao";
      await api.createTask({
        title: `[Email] ${selectedEmail.subject}`,
        priority: isUrgent ? "high" : isHigh ? "high" : "medium",
        source_type: "email",
      });
      toast.success("Đã tạo và lưu công việc vào cơ sở dữ liệu (Tasks)!");
    } catch (e: any) {
      toast.error(e.message || "Lỗi tạo công việc");
    }
  };

  const getUrgencyBadge = (urgency?: string) => {
    switch (urgency) {
      case "Khẩn cấp":
        return {
          className:
            "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-400/40 font-bold",
          text: "Khẩn cấp",
        };
      case "Cao":
        return {
          className:
            "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-400/40 font-semibold",
          text: "Cao",
        };
      case "Thấp":
        return {
          className:
            "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700",
          text: "Thấp",
        };
      default:
        return {
          className:
            "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-400/30",
          text: urgency || "Trung bình",
        };
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/60 dark:border-white/10 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-rose-500" />
            <span>Hộp Thư & Quét Email Gmail API v1</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tự động lưu CSDL, lấy toàn bộ nhãn Gmail thật, tóm tắt PDF đính kèm & tích hợp quản lý công việc.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {onOpenFolderRulesModal && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenFolderRulesModal}
              className="rounded-xl gap-1.5 text-xs text-sky-600 dark:text-sky-400 border-sky-300 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/50"
            >
              <FolderTree className="h-3.5 w-3.5" />
              <span>Luật Folder</span>
            </Button>
          )}

          {onOpenDailyDigestModal && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenDailyDigestModal}
              className="rounded-xl gap-1.5 text-xs text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/50"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Báo Cáo Ngày (PDF)</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleTriggerPoll}
            disabled={isPolling}
            className="rounded-xl gap-1.5 text-xs text-slate-700 dark:text-slate-300"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isPolling ? "animate-spin" : ""}`} />
            <span>Quét Ngầm Outbound</span>
          </Button>

          <Button
            size="sm"
            onClick={onOpenSendModal}
            className="bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl gap-1.5 shadow-md shadow-rose-500/25 border border-white/20 active:scale-[0.97]"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Soạn Thư Mới</span>
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="rounded-2xl p-3.5 shadow-glass-sm">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Nhãn Gmail:</span>
            <select
              value={folder}
              onChange={(e) => handleFolderChange(e.target.value)}
              className="bg-white/70 dark:bg-slate-900/70 border border-white/70 dark:border-white/10 rounded-xl px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 backdrop-blur-md focus:outline-none focus:ring-1 focus:ring-rose-500 shadow-glass-sm"
            >
              {availableFolders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <span className="text-slate-500 font-medium">Whitelist:</span>
            <Input
              placeholder="boss@company.com, sv@student.edu.vn"
              value={whitelist}
              onChange={(e) => setWhitelist(e.target.value)}
              className="h-8 text-xs rounded-xl"
            />
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300">
            <Checkbox checked={unreadOnly} onCheckedChange={(c) => setUnreadOnly(!!c)} />
            <span>Chỉ chưa đọc</span>
          </label>

          <Button
            size="sm"
            onClick={handleScanEmails}
            disabled={isScanning}
            className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl gap-1.5 h-8 text-xs shadow-md shadow-indigo-500/20 border border-white/20 active:scale-[0.97]"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{isScanning ? "Đang quét 10 cái..." : "Quét Email (10 cái)"}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleScanMore}
            disabled={isScanningMore || isScanning}
            className="rounded-xl gap-1.5 h-8 text-xs border-dashed border-indigo-400 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            title="Quét tiếp 10 email kế tiếp từ Gmail và lưu vào DB"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isScanningMore ? "Đang quét tiếp..." : "Quét Tiếp (10 cái)"}</span>
          </Button>
        </div>
      </Card>

      {/* 2-Column Email Reader */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Email List (2 cols) */}
        <Card className="lg:col-span-2 rounded-2xl flex flex-col">
          <CardHeader className="pb-3 border-b border-white/60 dark:border-white/10">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-emerald-500" />
                <span>Đã Lưu Trong CSDL</span>
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {emails.length} thư
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleScanMore}
                  disabled={isScanningMore || isScanning}
                  className="h-6 text-[10px] px-2 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                >
                  <Plus className="h-3 w-3 mr-0.5" />
                  <span>Quét tiếp</span>
                </Button>
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3 space-y-2 max-h-[520px] overflow-y-auto flex-1">
            {emails.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Chưa có email nào được lưu. Bấm &quot;Quét Email (10 cái)&quot; để bắt đầu.
              </div>
            ) : (
              <>
                {emails.map((em) => {
                  const isSelected = selectedEmail?.id === em.id;
                  const badgeInfo = getUrgencyBadge(em.urgency);
                  const hasPdf = em.pdf_filename || em.has_attachments;

                  return (
                    <div
                      key={em.id}
                      onClick={() => setSelectedEmail(em)}
                      className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all duration-200 space-y-1.5 ${
                        isSelected
                          ? "bg-rose-500/15 border-rose-400/40 dark:bg-rose-950/60 dark:border-rose-900 shadow-glass-sm backdrop-blur-md"
                          : "bg-white/60 dark:bg-slate-900/60 border-white/70 dark:border-white/10 hover:border-rose-300 hover:bg-white/80 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[210px]">
                          {em.subject}
                        </span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full flex-shrink-0 ${badgeInfo.className}`}
                        >
                          {badgeInfo.text}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="truncate flex items-center gap-1 max-w-[170px]">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{em.sender}</span>
                        </span>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {em.folder && em.folder !== "INBOX" && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-400/30">
                              {em.folder}
                            </span>
                          )}
                          {em.category && em.category !== "Khác" && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-400/30">
                              {em.category}
                            </span>
                          )}
                          {hasPdf && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-400/30 flex items-center gap-0.5">
                              <FileText className="h-2.5 w-2.5 text-rose-500" />
                              <span>PDF</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Bottom scan more button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScanMore}
                  disabled={isScanningMore}
                  className="w-full text-xs rounded-xl border-dashed border-indigo-400/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 mt-2"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  <span>{isScanningMore ? "Đang quét 10 cái kế tiếp..." : "Quét Tiếp 10 Email Kế Tiếp"}</span>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Email Detail & Action Toolbar (3 cols) */}
        <Card className="lg:col-span-3 rounded-2xl">
          {selectedEmail ? (
            <>
              <CardHeader className="border-b border-white/60 dark:border-white/10 pb-4">
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

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      {selectedEmail.folder && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-400/30">
                          {selectedEmail.folder}
                        </span>
                      )}
                      {selectedEmail.category && selectedEmail.category !== "Khác" && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-400/30">
                          {selectedEmail.category}
                        </span>
                      )}
                    </div>

                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full ${
                        getUrgencyBadge(selectedEmail.urgency).className
                      }`}
                    >
                      {getUrgencyBadge(selectedEmail.urgency).text}
                    </span>
                  </div>
                </div>

                {/* Attached PDF Summary Card if present */}
                {(selectedEmail.pdf_filename || selectedEmail.pdf_summary) && (
                  <div className="mt-3 p-3.5 rounded-xl border border-sky-400/40 bg-sky-500/10 dark:bg-sky-950/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-semibold text-xs">
                        <FileText className="h-4 w-4 text-rose-500" />
                        <span>Tệp PDF đính kèm:</span>
                        <span className="font-mono underline text-slate-900 dark:text-white">
                          {selectedEmail.pdf_filename || "tệp đính kèm.pdf"}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[9px] bg-sky-500/10 text-sky-600 dark:text-sky-300">
                        Đã tóm tắt bởi AI
                      </Badge>
                    </div>

                    <div className="text-xs text-slate-700 dark:text-slate-200 bg-white/60 dark:bg-slate-950/60 p-3 rounded-lg border border-sky-200 dark:border-sky-900/40 leading-relaxed max-h-44 overflow-y-auto">
                      <div className="prose prose-xs dark:prose-invert max-w-none [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0.5 [&_strong]:text-slate-900 dark:[&_strong]:text-white">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {selectedEmail.pdf_summary || "Đã trích xuất tệp PDF."}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4 Quick Action Triggers */}
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/60 dark:border-white/10">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveAsTask}
                    className="gap-1.5 text-xs rounded-xl text-sky-600 hover:text-sky-700 dark:text-sky-400"
                    title="Lưu thành công việc vào CSDL Tasks"
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-sky-500" />
                    <span>📌 Tạo Việc (Task)</span>
                  </Button>

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

              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between border-b border-white/60 dark:border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Nội Dung Thư & Phân Tích:
                    </p>
                    <Badge variant="outline" className="text-[10px] font-normal text-indigo-500 border-indigo-400/30">
                      {viewMode === "preview" ? "Định dạng Xem Trước (Preview)" : "Mã Nguồn Thô (Raw MD)"}
                    </Badge>
                  </div>

                  {/* Switcher: Preview vs Raw Code */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setViewMode("preview")}
                      className={`px-2 py-0.5 rounded-md transition font-medium flex items-center gap-1 ${
                        viewMode === "preview"
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      <Eye className="h-3 w-3" />
                      <span>Xem trước</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("raw")}
                      className={`px-2 py-0.5 rounded-md transition font-medium flex items-center gap-1 ${
                        viewMode === "raw"
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      <Code className="h-3 w-3" />
                      <span>Mã thô</span>
                    </button>
                  </div>
                </div>

                {viewMode === "preview" ? (
                  <div className="bg-white/60 dark:bg-slate-950/60 backdrop-blur-md p-4 rounded-xl border border-white/60 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200 leading-relaxed min-h-[220px] max-h-[520px] overflow-y-auto">
                    <div className="prose prose-xs dark:prose-invert max-w-none space-y-2 [&_h1]:text-sm [&_h1]:font-bold [&_h2]:text-xs [&_h2]:font-bold [&_h3]:text-xs [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-1.5 [&_strong]:text-slate-900 dark:[&_strong]:text-white [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 dark:[&_th]:border-slate-700 [&_th]:p-1.5 [&_td]:border [&_td]:border-slate-300 dark:[&_td]:border-slate-700 [&_td]:p-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-400 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:bg-slate-100 dark:[&_code]:bg-slate-900 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedEmail.summary}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap min-h-[220px] max-h-[520px] overflow-y-auto">
                    {selectedEmail.summary}
                  </div>
                )}
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
