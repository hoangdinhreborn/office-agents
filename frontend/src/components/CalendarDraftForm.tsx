import { IconDots, IconLoader2, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import * as api from '../lib/calendar-api';
import type { CalendarConflict, CalendarDraftItem, RepeatOption, ScheduleDraft } from '../types/workspace';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { CustomRepeatDialog } from './CustomRepeatDialog';
import { formatRepeatSummary } from '../utils/format';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';

const EMPTY_ITEMS: CalendarDraftItem[] = [];
const repeats: RepeatOption[] = ['Does not repeat', 'Daily', 'Weekly on Wednesday', 'Monthly on the fourth Wednesday',
  'Monthly on the last Wednesday', 'Annually on November 25', 'Every weekday (Monday to Friday)', 'Custom...'];
const labels = ['Không lặp', 'Hằng ngày', 'Hằng tuần theo ngày đã chọn', 'Hằng tháng theo thứ và tuần đã chọn',
  'Hằng tháng vào thứ cuối cùng tương ứng', 'Hằng năm theo ngày đã chọn', 'Các ngày thứ Hai–thứ Sáu', 'Tùy chỉnh…'];
const inputClass = 'w-full h-9 px-2.5 rounded-[8px] bg-[var(--surface-control)] text-[13px] text-[var(--text)]';

export function CalendarDraftForm({ projectId, resourceId = null, initialDrafts = EMPTY_ITEMS }: {
  projectId: string; resourceId?: string | null; initialDrafts?: CalendarDraftItem[];
}) {
  const refresh = useWorkspaceStore((s) => s.refreshCalendarData);
  const addToast = useWorkspaceStore((s) => s.addToast);
  const [items, setItems] = useState(initialDrafts);
  const [item, setItem] = useState<CalendarDraftItem | null>(initialDrafts[0] || null);
  const [draft, setDraft] = useState<ScheduleDraft>(initialDrafts[0]?.draft || api.emptySchedule());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleCheck, setGoogleCheck] = useState<{ found: boolean; message: string } | null>(null);
  useEffect(() => { setGoogleCheck(null); }, [item?.id, item?.eventId]);
  const [conflicts, setConflicts] = useState<CalendarConflict[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkNonce, setCheckNonce] = useState(0);
  const [allowConflicts, setAllowConflicts] = useState(false);
  const locked = Boolean(item?.eventId);
  const complete = Boolean(draft.title.trim() && draft.date && (!draft.hasDeadline || draft.deadlineDate)
    && (draft.allDay || (draft.startTime && draft.endTime && draft.endTime > draft.startTime)));
  const draftKey = JSON.stringify([draft.date, draft.startTime, draft.endTime, draft.allDay, complete]);

  useEffect(() => {
    // A refresh elsewhere must not erase edits that the user has not saved.
    if (dirty || busy) return;
    setItems(initialDrafts);
    const selected = initialDrafts.find((row) => row.id === item?.id) || initialDrafts[0] || null;
    setItem(selected); setDraft(selected?.draft || api.emptySchedule());
  }, [initialDrafts]);

  useEffect(() => {
    setAllowConflicts(false); setCheckError(null); setConflicts([]);
    if (!complete || locked) { setChecking(false); return; }
    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(() => {
      void api.checkConflicts(projectId, draft, item?.eventId).then((list) => { if (!cancelled) setConflicts(list); })
        .catch((e: unknown) => { if (!cancelled) setCheckError(e instanceof Error ? e.message : 'Chưa kiểm tra được lịch.'); })
        .finally(() => { if (!cancelled) setChecking(false); });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectId, draftKey, locked, checkNonce]);

  const edit = (patch: Partial<ScheduleDraft>) => { setDraft((prev) => ({ ...prev, ...patch })); setDirty(true); setError(null); };
  const accept = (next: CalendarDraftItem) => {
    setItem(next); setDraft(next.draft); setDirty(false);
    setItems((old) => [next, ...old.filter((row) => row.id !== next.id)]);
  };
  const persist = async () => {
    if (item && !dirty) return item;
    const saved = await api.saveDraft(projectId, resourceId, item, draft);
    accept(saved); return saved;
  };
  const recover = async (id = item?.id) => {
    if (id) { try { accept(await api.readDraft(projectId, id)); } catch { /* Keep the error and current input visible. */ } }
  };
  const save = async () => {
    setBusy(true); setError(null);
    try { await persist(); addToast('success', 'Đã lưu nháp lịch. Chưa tạo sự kiện Google.'); await refresh(projectId); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được nháp.'); }
    finally { setBusy(false); }
  };
  const approve = async () => {
    setBusy(true); setError(null);
    let currentItem = item;
    try {
      const saved = await persist();
      currentItem = saved;
      const result = await api.approveDraft(projectId, saved, allowConflicts);
      accept(result.draft);
      addToast(result.warning ? 'warning' : 'success', result.warning || (result.isDuplicate ? 'Đã xác nhận lịch hiện có trên Google; không tạo đúp.' : 'Đã tạo lịch trên Google Calendar.'), 'Hoàn tác', async () => {
        try { await api.undoEvent(projectId, result.event.id); await refresh(projectId); accept(await api.readDraft(projectId, saved.id)); addToast('success', 'Đã xóa lịch trên Google và giữ lại nháp.'); }
        catch (e) { addToast('warning', e instanceof Error ? e.message : 'Chưa hoàn tác được lịch.'); }
      });
      await refresh(projectId);
    } catch (e) {
      const latestConflicts = api.conflictsFromError(e);
      if (latestConflicts) { setConflicts(latestConflicts); setAllowConflicts(false); }
      setError(e instanceof Error ? e.message : 'Chưa tạo được lịch.');
      await recover(currentItem?.id);
    } finally { setBusy(false); }
  };
  const verifyGoogle = async () => {
    if (!item?.eventId) return;
    setBusy(true); setError(null); setGoogleCheck(null);
    try {
      const result = await api.verifyEvent(projectId, item.eventId);
      if (result.draft) accept(result.draft);
      setGoogleCheck({ found: result.state === 'found', message: result.message });
      await refresh(projectId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Chưa kiểm tra được sự kiện trên Google.'); }
    finally { setBusy(false); }
  };
  const undo = async () => {
    if (!item?.eventId) return;
    setBusy(true); setError(null);
    try { await api.undoEvent(projectId, item.eventId); accept(await api.readDraft(projectId, item.id)); await refresh(projectId); addToast('success', 'Đã xóa lịch trên Google; nháp được giữ lại.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Chưa hoàn tác được lịch.'); await recover(); }
    finally { setBusy(false); }
  };
  const extract = async () => {
    if (!resourceId) return;
    if (dirty) { setError('Lưu hoặc bỏ thay đổi trên nháp hiện tại trước khi trích xuất thêm.'); return; }
    setBusy(true); setError(null);
    try {
      const rows = await api.extractDrafts(projectId, resourceId);
      if (rows.length) { accept(rows[0]); setItems((old) => [...rows, ...old.filter((row) => !rows.some((n) => n.id === row.id))]); }
      else addToast('info', 'Chưa trích xuất được cuộc hẹn hoặc hạn chót từ nguồn. Nháp hiện tại được giữ nguyên.');
      await refresh(projectId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Chưa trích xuất được nháp.'); }
    finally { setBusy(false); }
  };

  return <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2 flex-wrap">
      {items.length > 0 && <select aria-label="Chọn nháp lịch" disabled={busy} value={item?.id || ''} className={`${inputClass} flex-1`}
        onChange={(e) => { if (dirty) { setError('Lưu hoặc bỏ thay đổi trước khi chuyển nháp.'); return; } const next = items.find((row) => row.id === e.target.value); if (next) accept(next); }}>
        {items.map((row, index) => <option key={row.id} value={row.id}>{row.draft.title || `Nháp ${index + 1}`}{row.draft.isApproved ? ' · Đã duyệt' : ''}</option>)}
      </select>}
      {resourceId && <button type="button" disabled={busy} onClick={() => void extract()} className="text-[12px] font-semibold text-[var(--accent-ink)] disabled:opacity-50 cursor-pointer">Trích xuất từ nguồn</button>}
    </div>
    {draft.needsConfirmation && !draft.isApproved && <p className="text-[12px] text-[var(--warning-fg)]">Nguồn chưa có đủ khung giờ sự kiện hoặc cần xác nhận. Hãy rà soát và bổ sung trên nháp trước khi duyệt.</p>}
    {locked && <p className="text-[12px] text-[var(--text-muted)]">{draft.isApproved ? 'Đã duyệt lịch. Mở Google Calendar để xem sự kiện; hoàn tác trước khi sửa nháp.' : 'Thao tác với Google chưa hoàn tất. Kiểm tra lại kết quả hoặc hoàn tác cùng sự kiện.'}</p>}
    <fieldset disabled={busy || locked} className="flex flex-col gap-3 disabled:opacity-70">
      <label className="text-[13px] font-semibold">Tiêu đề lịch<input aria-label="Tiêu đề lịch" className={inputClass} value={draft.title} onChange={(e) => edit({ title: e.target.value })} /></label>
      <div className="flex gap-2 flex-wrap">
        <input type="date" aria-label="Ngày diễn ra" className={`${inputClass} flex-1 min-w-[130px]`} value={draft.date} onChange={(e) => edit({ date: e.target.value })} />
        {!draft.allDay && <>
          <input type="time" aria-label="Giờ bắt đầu" className={`${inputClass} !w-auto`} value={draft.startTime} onChange={(e) => edit({ startTime: e.target.value })} />
          <input type="time" aria-label="Giờ kết thúc" className={`${inputClass} !w-auto`} value={draft.endTime} onChange={(e) => edit({ endTime: e.target.value })} />
        </>}
      </div>
      <label className="flex gap-2 items-center text-[13px]"><input type="checkbox" checked={draft.allDay} onChange={(e) => edit({ allDay: e.target.checked })} />Cả ngày</label>
      <select aria-label="Tần suất lặp lại" className={inputClass} value={draft.repeat} onChange={(e) => {
        const repeat = repeats.find((value) => value === e.target.value);
        if (repeat === 'Custom...') setRepeatOpen(true); else if (repeat) edit({ repeat });
      }}>{repeats.map((repeat, index) => <option key={repeat} value={repeat}>{labels[index]}</option>)}</select>
      {draft.repeat === 'Custom...' && <button type="button" onClick={() => setRepeatOpen(true)} className="text-[12px] text-[var(--accent-ink)] text-left cursor-pointer">{formatRepeatSummary(draft.repeat, draft.customRepeat)} · Chỉnh sửa</button>}
      <label className="flex gap-2 items-center text-[13px]"><input type="checkbox" checked={draft.hasDeadline} onChange={(e) => edit({ hasDeadline: e.target.checked, deadlineAt: e.target.checked ? draft.deadlineAt : undefined })} />Có hạn chót riêng</label>
      {draft.hasDeadline && draft.deadlineAt && <p className="text-[12px] text-[var(--text-muted)]">
        Hạn chót từ nguồn: {new Date(draft.deadlineAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })} (UTC+07).
        {' '}Đây là mốc hết hạn; chọn riêng thời gian bạn muốn dành cho sự kiện hoặc nhắc việc.
      </p>}
      {draft.hasDeadline && <input type="date" aria-label="Ngày hạn chót" className={inputClass} value={draft.deadlineDate} onChange={(e) => edit({ deadlineDate: e.target.value, deadlineAt: undefined })} />}
      <textarea aria-label="Mô tả sự kiện" rows={3} className={`${inputClass} !h-auto py-2`} value={draft.description} placeholder="Mô tả" onChange={(e) => edit({ description: e.target.value })} />
    </fieldset>
    {!locked && <div className="text-[12px] space-y-2">
      {checking && <p>Đang đối chiếu lịch Google và các dự án…</p>}
      {checkError && <p className="text-[var(--warning-fg)]">{checkError} <button type="button" onClick={() => setCheckNonce((n) => n + 1)} className="font-semibold underline cursor-pointer">Kiểm tra lại</button></p>}
      {conflicts.length > 0 && <div className="rounded-[8px] p-3 bg-[var(--warning-bg)] text-[var(--warning-fg)]">
        <p className="font-semibold">Trùng khung giờ với lịch hiện có:</p>
        <ul className="list-disc pl-4">{conflicts.map((c) => <li key={`${c.source}:${c.id}`}>{c.title} · {new Date(c.startTime).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}{c.allDay ? ' · Cả ngày' : ''}</li>)}</ul>
        <label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={allowConflicts} onChange={(e) => setAllowConflicts(e.target.checked)} />Tôi vẫn muốn tạo lịch vào khung giờ này</label>
      </div>}
    </div>}
    {item?.googleAccountEmail && <p className="text-[12px] text-[var(--text-muted)]">Lịch Google: {item.googleAccountEmail}</p>}
    {googleCheck && <p role="status" className={`text-[12px] ${googleCheck.found ? 'text-[var(--text-body)]' : 'text-[var(--warning-fg)]'}`}>{googleCheck.message}</p>}
    {error && <div role="alert" className="text-[12px] text-[var(--destroy-fg)]"><p>{error}</p>{item && <button type="button" disabled={busy} onClick={() => void recover()} className="underline cursor-pointer">Nạp lại nháp đã lưu (bỏ thay đổi chưa lưu)</button>}</div>}
    <div className="flex gap-2 items-center justify-end flex-wrap">
      {dirty && <button type="button" disabled={busy} onClick={() => { setDraft(item?.draft || api.emptySchedule()); setDirty(false); setError(null); }} className="text-[12px] cursor-pointer">Bỏ thay đổi</button>}
      {!locked && <button type="button" disabled={busy || (!dirty && Boolean(item))} onClick={() => void save()} className="px-3 h-9 rounded-[8px] bg-[var(--surface-control)] text-[13px] disabled:opacity-50 cursor-pointer">Lưu nháp</button>}
      {item?.eventId && !draft.isApproved && <button type="button" disabled={busy} onClick={() => void undo()} className="px-3 h-9 text-[13px] text-[var(--destroy-fg)] disabled:opacity-50 cursor-pointer">{item.operationStatus === 'deleting' ? 'Thử hoàn tác lại' : 'Hoàn tác lịch'}</button>}
      {draft.isApproved && item?.googleLink && <a href={item.googleLink} target="_blank" rel="noopener noreferrer" className="px-3 h-9 rounded-[8px] border border-[var(--border)] text-[13px] font-semibold text-[var(--accent-ink)] inline-flex items-center">Mở Google Calendar</a>}
      {draft.isApproved && item?.eventId && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={busy} aria-label="Tùy chọn sự kiện" className="h-9 w-9 inline-flex items-center justify-center rounded-[8px] hover:bg-[var(--surface-control)] disabled:opacity-50 cursor-pointer"><IconDots size={18} /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void verifyGoogle()}>Kiểm tra trên Google</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void undo()} className="text-[var(--destroy-fg)]">Hoàn tác lịch</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
      {!draft.isApproved && item?.operationStatus !== 'deleting' && <button type="button" disabled={busy || (!locked && (!complete || checking || Boolean(checkError) || (conflicts.length > 0 && !allowConflicts)))} onClick={() => void approve()} className="h-9 px-4 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer">
        {busy && <IconLoader2 size={15} className="animate-spin" />}{locked ? 'Kiểm tra lại kết quả' : 'Duyệt và tạo lịch'}
      </button>}
    </div>
    <CustomRepeatDialog open={repeatOpen} initialValue={draft.customRepeat} onSave={(customRepeat) => { edit({ repeat: 'Custom...', customRepeat }); setRepeatOpen(false); }} onClose={() => setRepeatOpen(false)} />
  </div>;
}

export function CalendarDraftDialog({ projectId, drafts, onClose }: { projectId: string; drafts: CalendarDraftItem[]; onClose: () => void }) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);
  return <div className="fixed inset-0 z-50 bg-[var(--overlay-backdrop)] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="calendar-draft-dialog-title" onClick={onClose}>
    <div className="w-full max-w-[640px] max-h-[85vh] scroll-area rounded-[16px] bg-[var(--surface)] text-[var(--text)] p-5 space-y-4" onClick={(event) => event.stopPropagation()}>
      <div className="flex justify-between items-center"><h2 id="calendar-draft-dialog-title" className="font-semibold text-[18px]">Rà soát và duyệt lịch</h2><button type="button" aria-label="Đóng nháp lịch" onClick={onClose} className="p-2 cursor-pointer"><IconX size={18} /></button></div>
      <CalendarDraftForm projectId={projectId} initialDrafts={drafts} />
    </div>
  </div>;
}
