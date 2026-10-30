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
        <Button
          variant="ghost"
          size="icon"
          className="relative text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60 backdrop-blur-sm transition-all"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white shadow-xs animate-pulse">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-glass-lg border border-white/70 dark:border-white/15 bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/60 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md px-4 py-2.5">
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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-lg"
            onClick={onRefresh}
            title="Làm mới"
          >
            <RefreshCw className="h-3 w-3 text-slate-500" />
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-white/40 dark:divide-white/5 text-xs">
          {!data || data.items.length === 0 ? (
            <div className="p-6 text-center text-slate-400">Không có lịch hẹn nào sắp tới</div>
          ) : (
            data.items.slice(0, 5).map((ev) => (
              <div
                key={ev.id}
                onClick={onNavigateToCalendar}
                className="group flex cursor-pointer items-start gap-3 p-3 transition-all duration-200 hover:bg-white/60 dark:hover:bg-slate-800/60"
              >
                <div
                  className={`mt-0.5 rounded-xl p-1.5 border border-white/40 dark:border-white/10 shadow-xs ${
                    ev.is_imminent
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                  }`}
                >
                  <Calendar className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
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

        <div className="border-t border-white/60 dark:border-white/10 p-2 text-center bg-white/40 dark:bg-slate-900/40 backdrop-blur-md">
          <button
            onClick={onNavigateToCalendar}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 transition-colors"
          >
            <span>Xem toàn bộ lịch trình</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
