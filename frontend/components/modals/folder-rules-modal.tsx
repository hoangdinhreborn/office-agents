"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { FolderTree, Trash2, Plus, Sparkles, Cloud, Check } from "lucide-react";
import { EmailFolderRule } from "@/types";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface FolderRulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function FolderRulesModal({ open, onOpenChange, onSuccess }: FolderRulesModalProps) {
  const [rules, setRules] = useState<EmailFolderRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [folderName, setFolderName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [senders, setSenders] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [autoGmail, setAutoGmail] = useState(true);

  const loadRules = async () => {
    setIsLoading(true);
    try {
      const data = await api.listFolderRules();
      setRules(data || []);
    } catch (e: any) {
      toast.error(e.message || "Lỗi tải danh sách luật");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadRules();
    }
  }, [open]);

  const handleSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) {
      toast.warning("Vui lòng nhập tên thư mục!");
      return;
    }

    setIsSubmitting(true);
    try {
      const kwList = keywords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const senderList = senders
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await api.createFolderRule({
        folder_name: folderName.trim(),
        keywords: kwList,
        senders: senderList,
        color,
        auto_apply_gmail_label: autoGmail,
      });

      toast.success(`Đã lưu luật phân loại cho thư mục "${folderName.trim()}"!`);
      setFolderName("");
      setKeywords("");
      setSenders("");
      await loadRules();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Lỗi lưu luật");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRule = async (ruleId: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa luật cho thư mục "${name}"?`)) return;
    try {
      await api.deleteFolderRule(ruleId);
      toast.success(`Đã xóa luật "${name}"!`);
      await loadRules();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Lỗi xóa luật");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-2xl shadow-glass-lg">
        <DialogHeader className="border-b border-white/60 dark:border-white/10 pb-3">
          <DialogTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-sky-500" />
            <span>Quản Lý Thư Mục & Luật Phân Loại Email</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Tác tử AI tự động đưa email vào thư mục tương ứng theo từ khóa hoặc vai trò/người gửi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {/* Form Create/Edit */}
          <form
            onSubmit={handleSubmitRule}
            className="bg-slate-50/80 dark:bg-slate-950/60 p-4 rounded-xl border border-white/60 dark:border-white/10 space-y-3"
          >
            <h4 className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Plus className="h-3.5 w-3.5" />
              <span>Thêm Hoặc Cập Nhật Luật Phân Loại</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Tên thư mục / Nhãn:
                </label>
                <Input
                  placeholder="VD: Nộp bài tập, Học vụ, Khẩn cấp..."
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="h-8 text-xs rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Mã màu nhận diện:
                </label>
                <select
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="#3B82F6">Xanh Dương (Blue)</option>
                  <option value="#10B981">Xanh Lá (Green)</option>
                  <option value="#EF4444">Đỏ (Red / Urgent)</option>
                  <option value="#F59E0B">Vàng Cam (Amber)</option>
                  <option value="#8B5CF6">Tím (Purple)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Từ khóa nội dung (cách nhau bởi dấu phẩy):
              </label>
              <Input
                placeholder="VD: bài tập, nộp bài, assignment, đồ án, lab, báo cáo"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="h-8 text-xs rounded-xl"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Người gửi / Vai trò (cách nhau bởi dấu phẩy, hỗ trợ wildcard *@domain):
              </label>
              <Input
                placeholder="VD: *@student.edu.vn, daotao@truong.edu.vn, boss@company.com"
                value={senders}
                onChange={(e) => setSenders(e.target.value)}
                className="h-8 text-xs rounded-xl"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300">
                <Checkbox checked={autoGmail} onCheckedChange={(c) => setAutoGmail(!!c)} />
                <span>Tự động đồng bộ và gắn nhãn trên Gmail API</span>
              </label>

              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs h-8 gap-1.5 shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isSubmitting ? "Đang lưu..." : "Lưu Luật Phân Loại"}</span>
              </Button>
            </div>
          </form>

          {/* Rules List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Danh Sách Luật Đang Áp Dụng ({rules.length}):
            </h4>

            {isLoading ? (
              <div className="p-6 text-center text-xs text-slate-400">Đang tải danh sách luật...</div>
            ) : rules.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                Chưa có luật phân loại nào. Hãy tạo luật đầu tiên bên trên.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {rules.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl border border-white/60 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          style={{
                            backgroundColor: `${r.color}20`,
                            color: r.color,
                            borderColor: `${r.color}50`,
                          }}
                          className="font-bold border"
                        >
                          {r.folder_name}
                        </Badge>
                        {r.auto_apply_gmail_label && (
                          <span className="text-[10px] text-emerald-500 flex items-center gap-1 font-medium">
                            <Cloud className="h-3 w-3" />
                            <span>Sync Gmail</span>
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                        {r.keywords && r.keywords.length > 0 && (
                          <div>
                            <span className="font-medium text-slate-600 dark:text-slate-300">Từ khóa:</span>{" "}
                            {r.keywords.join(", ")}
                          </div>
                        )}
                        {r.senders && r.senders.length > 0 && (
                          <div>
                            <span className="font-medium text-slate-600 dark:text-slate-300">Người gửi:</span>{" "}
                            {r.senders.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteRule(r.id, r.folder_name)}
                      className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 h-7 w-7 p-0 rounded-lg flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
