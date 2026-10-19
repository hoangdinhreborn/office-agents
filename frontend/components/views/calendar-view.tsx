"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  Plus,
  RefreshCw,
  Bell,
  Sparkles,
  Download,
  FileCheck,
  Clock,
  MapPin,
} from "lucide-react";
import { CalendarEvent, UpcomingEventsResponse } from "@/types";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface CalendarViewProps {
  upcomingData: UpcomingEventsResponse | null;
  onRefreshUpcoming: () => void;
  onOpenCreateModal: () => void;
}

export function CalendarView({
  upcomingData,
  onRefreshUpcoming,
  onOpenCreateModal,
}: CalendarViewProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await api.getCalendarEvents(1, 10);
      setEvents(data.items || []);
    } catch (e: any) {
      toast.error(e.message || "Lỗi tải danh sách sự kiện");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
    const handler = () => loadEvents();
    window.addEventListener("calendar-event-created", handler);
    return () => window.removeEventListener("calendar-event-created", handler);
  }, []);

  const handleQuickSchedule = async () => {
    if (!promptText.trim()) return;
    setScheduling(true);
    try {
      await api.extractAndScheduleCalendar(promptText, 30);
      toast.success("Đã trích xuất và lên lịch thành công!");
      setPromptText("");
      loadEvents();
      onRefreshUpcoming();
    } catch (e: any) {
      toast.error(e.message || "Lỗi lên lịch");
    } finally {
      setScheduling(false);
    }
  };

  const imminentEvent = upcomingData?.items?.find((i) => i.is_imminent) || upcomingData?.items?.[0];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50/50 dark:bg-slate-950/50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-emerald-500" />
            <span>Quản Lý Lịch Trình & Google Calendar</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Đồng bộ đám mây Google Calendar (OAuth 2.0) và xuất file .ICS chuẩn RFC-5545 kèm chuông nhắc trước.
          </p>
        </div>

        <Button
          onClick={onOpenCreateModal}
          className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl gap-2 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Tạo Sự Kiện Mới</span>
        </Button>
      </div>

      {/* Upcoming Alert Banner */}
      <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 via-teal-50 to-white dark:from-emerald-950/60 dark:via-slate-900 dark:to-slate-900 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-700">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              {imminentEvent
                ? `🔔 Sự kiện sắp tới: ${imminentEvent.title}`
                : "Chưa có sự kiện khẩn cấp nào sắp diễn ra"}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              {imminentEvent
                ? `Diễn ra trong ${imminentEvent.minutes_until} phút nữa tại ${imminentEvent.location || "Online"}. Hệ thống đã đặt chuông báo trước.`
                : "Hệ thống sẽ quét ngầm và phát chuông âm thanh Web Audio API khi có sự kiện trong 30 phút tới."}
            </p>
          </div>
        </div>

        <span className="font-mono text-xs bg-white dark:bg-slate-950 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 font-semibold shadow-xs">
          {imminentEvent ? `Còn ${imminentEvent.minutes_until} phút` : "Hệ thống sẵn sàng"}
        </span>
      </div>

      {/* Quick NLP Scheduling Box */}
      <Card className="rounded-2xl border-slate-200/80 dark:border-slate-800 shadow-xs">
        <CardHeader className="pb-2.5">
          <CardTitle className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            <span>Lên Lịch Tự Do Bằng Ngôn Ngữ Tự Nhiên</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Nhập câu yêu cầu bằng tiếng Việt thường nhật, AI Scheduler sẽ tự động phân tích thời gian và địa điểm.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="VD: Họp rà soát tiến độ với khách hàng lúc 9h30 sáng thứ 5 tuần tới tại phòng A, nhắc trước 30 phút"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuickSchedule();
              }}
              className="rounded-xl text-xs h-9"
            />
            <Button
              onClick={handleQuickSchedule}
              disabled={scheduling || !promptText.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl gap-1.5 px-4 h-9 text-xs"
            >
              <span>{scheduling ? "Đang lên lịch..." : "Lên Lịch Ngay"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Events Table */}
      <Card className="rounded-2xl border-slate-200/80 dark:border-slate-800 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Danh Sách Sự Kiện Đã Đặt
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadEvents}
            disabled={loading}
            className="h-7 text-xs gap-1 text-slate-500"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 dark:bg-slate-900/70 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3.5 pl-5">Tiêu Đề</th>
                  <th className="p-3.5">Bắt Đầu</th>
                  <th className="p-3.5">Kết Thúc</th>
                  <th className="p-3.5">Chuông Nhắc</th>
                  <th className="p-3.5">Địa Điểm</th>
                  <th className="p-3.5">Đồng Bộ Đám Mây</th>
                  <th className="p-3.5 pr-5 text-right">Tệp .ICS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Chưa có sự kiện nào. Hãy nhập câu lệnh lên lịch ở trên.
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                      <td className="p-3.5 pl-5 font-semibold text-slate-900 dark:text-white">
                        {ev.title}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-500">
                        {ev.start_time || "-"}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-500">
                        {ev.end_time || "-"}
                      </td>
                      <td className="p-3.5">
                        <Badge variant="amber" className="gap-1 text-[10px]">
                          <Bell className="h-3 w-3" />
                          <span>{ev.reminder_minutes}p</span>
                        </Badge>
                      </td>
                      <td className="p-3.5 text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          <span>{ev.location || "Online"}</span>
                        </span>
                      </td>
                      <td className="p-3.5">
                        {ev.synced_desktop ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5" /> Google Calendar
                          </span>
                        ) : (
                          <span className="text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1">
                            <FileCheck className="h-3.5 w-3.5" /> Chuẩn .ICS
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 pr-5 text-right">
                        <a
                          href={`/api/calendar/download-ics/${ev.id}`}
                          className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-medium transition"
                        >
                          <Download className="h-3 w-3" />
                          <span>.ICS</span>
                        </a>
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
