"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  UploadCloud,
  RotateCw,
  CalendarPlus,
  Clock,
  Sparkles,
  FileCheck2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

interface DocsViewProps {
  onQuickPrompt: (promptText: string) => void;
}

export function DocsView({ onQuickPrompt }: DocsViewProps) {
  const [selectedDoc, setSelectedDoc] = useState<string>("Q4_Finance_Report.pdf");

  const sampleSummary = `### Tóm Tắt Điều Hành (Executive Summary)
- **Doanh thu thuần**: Đạt 142 tỷ VNĐ (tăng trưởng 18.5% so với cùng kỳ năm trước nhờ tối ưu hóa chuỗi cung ứng).
- **Chi phí vận hành**: Tiết giảm 6.2% ngân sách hàng tháng thông qua việc áp dụng Trợ lý AI Local On-Prem.
- **Rủi ro trọng yếu**: Cần gia hạn chứng chỉ SSL và bảo trì hạ tầng thanh toán trước ngày 30/11.
- **Kế hoạch hành động**: Tổ chức phiên nghiệm thu tài chính và phê duyệt hạn mức quý 1 năm sau.`;

  const sampleDeadlines = [
    { title: "Họp nghiệm thu tài chính quý 4", time: "15:30 - 25/11/2026", note: "Bắt buộc có mặt Kế toán trưởng" },
    { title: "Bảo trì hạ tầng thanh toán", time: "23:00 - 30/11/2026", note: "Chuyển hướng cổng gateway dự phòng" },
  ];

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedDoc(file.name);
      toast.success(`Đã nạp tệp ${file.name}. Bấm tóm tắt để AI phân tích.`);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50/50 dark:bg-slate-950/50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-sky-500" />
            <span>Quản Lý & Tóm Tắt Tài Liệu Chuẩn PDF</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Trích xuất văn bản qua PyMuPDF, tóm tắt điều hành 4 phần và nhận diện mốc thời gian tự động.
          </p>
        </div>

        <label className="cursor-pointer">
          <Button variant="default" className="bg-sky-600 hover:bg-sky-500 text-white rounded-xl gap-2 shadow-sm">
            <UploadCloud className="h-4 w-4" />
            <span>Tải Lên PDF Mới</span>
          </Button>
          <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Document List */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Danh Sách Tài Liệu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
            <div
              onClick={() => setSelectedDoc("Q4_Finance_Report.pdf")}
              className={`p-3.5 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between ${
                selectedDoc === "Q4_Finance_Report.pdf"
                  ? "bg-sky-50/70 border-sky-300 dark:bg-sky-950/60 dark:border-sky-800"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
              }`}
            >
              <div className="space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <FileCheck2 className="h-4 w-4 text-sky-500" />
                  <span>Q4_Finance_Report.pdf</span>
                </p>
                <p className="text-[11px] text-slate-500 font-mono">24 trang • Đã phân tích</p>
              </div>
              <Badge variant="emerald" className="text-[9px]">Đã Tóm Tắt</Badge>
            </div>

            <div
              onClick={() => setSelectedDoc("Kế_Hoạch_Triển_Khai_2026.pdf")}
              className={`p-3.5 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between ${
                selectedDoc === "Kế_Hoạch_Triển_Khai_2026.pdf"
                  ? "bg-sky-50/70 border-sky-300 dark:bg-sky-950/60 dark:border-sky-800"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
              }`}
            >
              <div className="space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <span>Kế_Hoạch_Triển_Khai_2026.pdf</span>
                </p>
                <p className="text-[11px] text-slate-500 font-mono">8 trang • Đang chờ</p>
              </div>
              <Badge variant="secondary" className="text-[9px]">Sẵn sàng</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Right: Document Analysis Tabs */}
        <Card className="lg:col-span-2 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">
                {selectedDoc}
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Đã xử lý thông qua Summarizer Agent và thuật toán Map-Reduce
              </CardDescription>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onQuickPrompt(`Tóm tắt lại tài liệu ${selectedDoc} với các trọng tâm giải pháp mới`)}
              className="gap-1.5 text-xs rounded-xl"
            >
              <RotateCw className="h-3 w-3" />
              <span>Tóm tắt lại</span>
            </Button>
          </CardHeader>

          <CardContent className="pt-4">
            <Tabs defaultValue="summary" className="space-y-4">
              <TabsList className="grid grid-cols-3 w-full max-w-md">
                <TabsTrigger value="summary">Tóm Tắt Điều Hành</TabsTrigger>
                <TabsTrigger value="deadlines">Mốc Thời Gian</TabsTrigger>
                <TabsTrigger value="raw">Văn Bản Trích Xuất</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="prose prose-xs dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed min-h-[220px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{sampleSummary}</ReactMarkdown>
              </TabsContent>

              <TabsContent value="deadlines" className="space-y-3 min-h-[220px]">
                {sampleDeadlines.map((dl, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        <span>{dl.title}</span>
                      </p>
                      <p className="text-slate-500 font-mono text-[11px]">{dl.time} • {dl.note}</p>
                    </div>

                    <Button
                      size="sm"
                      variant="emerald"
                      onClick={() => onQuickPrompt(`Lên lịch Google Calendar: ${dl.title} lúc ${dl.time}`)}
                      className="gap-1 text-[11px] rounded-lg h-7"
                    >
                      <CalendarPlus className="h-3 w-3" />
                      <span>Tạo Lịch</span>
                    </Button>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="raw" className="min-h-[220px]">
                <pre className="p-3 bg-slate-100 dark:bg-slate-950 rounded-xl text-[11px] font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {`--- BÁO CÁO TÀI CHÍNH QUÝ 4 / NĂM TÀI KHÓA ---
1. Tổng Doanh Thu: 142.500.000.000 VNĐ
2. Tỷ lệ tăng trưởng EBITDA: +18.5% YoY
3. Lợi nhuận gộp hoạt động: 46.200.000.000 VNĐ
4. Thời hạn nghiệm thu báo cáo kiểm toán độc lập: 15h30 ngày 25 tháng 11 năm 2026.
5. Bảo trì máy chủ kế toán: 23h00 ngày 30 tháng 11 năm 2026.`}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
