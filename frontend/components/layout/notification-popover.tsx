"use client";

import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Calendar, RefreshCw, ArrowRight } from "lucide-react";
import { UpcomingEventsResponse } from "@/types";

interface NotificationPopoverProps {
  data: UpcomingEventsResponse | null;
  onRefresh: () => void;
  onNavigateToCalendar: () => void;
}

export function NotificationPopover({
  data,
  onRefresh,
  onNavigateToCalendar,
}: NotificationPopoverProps) {
  const count = data?.items?.length || 0;
  const imminent = data?.imminent_count || 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-slate-600 dark:text-slate-300">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white shadow-sm">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Thông Báo Nhắc Hẹn
            </span>
            {imminent > 0 && (
              <Badge variant="rose" className="px-1.5 py-0">
                {imminent} Khẩn
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh} title="Làm mới">
            <RefreshCw className="h-3 w-3 text-slate-500" />
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {!data || data.items.length === 0 ? (
            <div className="p-6 text-center text-slate-400">Không có lịch hẹn nào sắp tới</div>
          ) : (
            data.items.slice(0, 5).map((ev) => (
              <div
                key={ev.id}
                onClick={onNavigateToCalendar}
                className="group flex cursor-pointer items-start gap-3 p-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <div
                  className={`mt-0.5 rounded-lg p-1.5 ${
                    ev.is_imminent
                      ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                      : "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
                  }`}
                >
                  <Calendar className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    {ev.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    {ev.start_time.substring(11, 16)} • Còn {ev.minutes_until} phút (Nhắc trước {ev.reminder_minutes}p)
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 p-2 text-center bg-slate-50/30 dark:bg-slate-900/30">
          <button
            onClick={onNavigateToCalendar}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            <span>Xem toàn bộ lịch trình</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
