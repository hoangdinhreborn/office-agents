import { useEffect, useRef } from 'react';
import { upcomingEvents } from './calendar-api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export function useCalendarReminders(enabled: boolean) {
  const seen = useRef(new Set<string>());
  const errorShown = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem('calendar-reminders') || '[]');
      if (Array.isArray(saved)) saved.filter((key): key is string => typeof key === 'string').forEach((key) => seen.current.add(key));
    } catch { /* Session storage may be unavailable; in-memory deduplication still works. */ }
    let cancelled = false, busy = false;
    const poll = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const items = await upcomingEvents();
        if (cancelled) return;
        errorShown.current = false;
        const fresh = items.filter((item) => item.is_imminent && !seen.current.has(`${item.occurrence_id}:${item.start_time}`));
        if (fresh.length) {
          fresh.forEach((item) => seen.current.add(`${item.occurrence_id}:${item.start_time}`));
          const labels = fresh.slice(0, 3).map((item) => item.title + (item.all_day ? ' (cả ngày)' : ` (${new Date(item.start_time).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })})`));
          useWorkspaceStore.getState().addToast('info', `Lịch sắp diễn ra: ${labels.join('; ')}${fresh.length > 3 ? ` và ${fresh.length - 3} lịch khác` : ''}.`);
          try { sessionStorage.setItem('calendar-reminders', JSON.stringify([...seen.current].slice(-200))); } catch { /* Keep in-memory state. */ }
        }
      } catch (error) {
        if (!cancelled && !errorShown.current) {
          errorShown.current = true;
          useWorkspaceStore.getState().addToast('warning', error instanceof Error ? error.message : 'Chưa tải được nhắc lịch.');
        }
      } finally { busy = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled]);
}
