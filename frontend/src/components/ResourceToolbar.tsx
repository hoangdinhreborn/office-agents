import {
  IconAlertTriangleFilled,
  IconCalendarCheck,
  IconCalendarPlus,
  IconCheck,
  IconLoader2,
  IconMailForward,
  IconX,
} from '@tabler/icons-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type {
  RepeatOption,
  ResourceItem,
  SolutionOption,
  SummaryStyle,
  ToolbarTab,
} from '../types/workspace';
import { formatRepeatSummary } from '../utils/format';
import { CitationMarkdown } from './CitationMarkdown';
import { CustomRepeatDialog } from './CustomRepeatDialog';
import { ReplyMailDialog } from './ReplyMailDialog';

interface ResourceToolbarProps {
  projectId: string;
  resource: ResourceItem;
  activeTab: ToolbarTab;
  onSelectTab: (tab: ToolbarTab) => void;
}

const REPEAT_OPTIONS: RepeatOption[] = [
  'Does not repeat',
  'Daily',
  'Weekly on Wednesday',
  'Monthly on the fourth Wednesday',
  'Monthly on the last Wednesday',
  'Annually on November 25',
  'Every weekday (Monday to Friday)',
  'Custom...',
];

const SUMMARY_STYLES: { value: SummaryStyle; label: string }[] = [
  { value: 'ngắn', label: 'Ngắn' },
  { value: 'ý chính', label: 'Ý chính' },
  { value: 'gạch đầu dòng', label: 'Gạch đầu dòng' },
];

export function ResourceToolbar({
  projectId,
  resource,
  activeTab,
  onSelectTab,
}: ResourceToolbarProps) {
  const projects = useWorkspaceStore((s) => s.projects);
  const calendarEvents = useWorkspaceStore((s) => s.calendarEvents);
  const regeneratingSolutionsResourceId = useWorkspaceStore(
    (s) => s.regeneratingSolutionsResourceId
  );
  const setResourceSummaryStyle = useWorkspaceStore((s) => s.setResourceSummaryStyle);
  const regenerateSolutions = useWorkspaceStore((s) => s.regenerateSolutions);
  const updateScheduleDraft = useWorkspaceStore((s) => s.updateScheduleDraft);
  const approveAndCreateSchedule = useWorkspaceStore((s) => s.approveAndCreateSchedule);

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  const [constraintInput, setConstraintInput] = useState('');
  const [customRepeatOpen, setCustomRepeatOpen] = useState(false);
  const [replySolutionTarget, setReplySolutionTarget] = useState<{
    solution: SolutionOption;
    index: number;
  } | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const isRegeneratingSolutions = regeneratingSolutionsResourceId === resource.id;

  const schedule = resource.schedule;
  const hasScheduleTitle = schedule.title.trim().length > 0;
  const hasScheduleDescription = schedule.description.trim().length > 0;

  useLayoutEffect(() => {
    if (activeTab !== 'schedule') return;
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [schedule.description, activeTab]);

  // Detect calendar conflict (UC_04.A5)
  const conflictingEvent = useMemo(() => {
    if (!schedule.date) return null;
    return (
      calendarEvents.find((evt) => {
        if (evt.id === schedule.approvedEventId) return false;
        if (evt.date !== schedule.date) return false;
        if (schedule.allDay || evt.allDay) return true;
        return schedule.startTime < evt.endTime && schedule.endTime > evt.startTime;
      }) ?? null
    );
  }, [calendarEvents, schedule]);

  const handleRepeatSelect = (value: RepeatOption) => {
    updateScheduleDraft(projectId, resource.id, { repeat: value });
    if (value === 'Custom...') {
      setCustomRepeatOpen(true);
    }
  };

  const handleApproveSchedule = () => {
    const result = approveAndCreateSchedule(projectId, resource.id);
    if (!result.ok) {
      setScheduleError(result.error ?? 'Vui lòng kiểm tra lại thông tin lịch.');
    } else {
      setScheduleError(null);
    }
  };

  return (
    <div className="mt-2 rounded-[12px] bg-[var(--surface-recessed)] p-3.5 flex flex-col gap-3">
      {/* toolbar-component.header: switch-button with 3 tabs */}
      <div
        role="tablist"
        aria-label="Công cụ xử lý nguồn"
        className="flex items-center gap-1 p-1 rounded-[8px] bg-[var(--surface-track)]"
      >
        {(
          [
            { id: 'summarize', label: 'Tóm tắt' },
            { id: 'solution', label: 'Đề xuất giải pháp' },
            { id: 'schedule', label: 'Đặt lịch' },
          ] as { id: ToolbarTab; label: string }[]
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 py-1.5 px-2.5 rounded-[6px] text-[13px] leading-[18px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[var(--surface)] text-[var(--text)]'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* toolbar-component.content (scroll enable) */}
      <div className="scroll-area max-h-[420px] pr-1">
        {/* TAB 1: summarize-tab */}
        {activeTab === 'summarize' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                {SUMMARY_STYLES.map((st) => {
                  const active = resource.activeSummaryStyle === st.value;
                  return (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() => setResourceSummaryStyle(projectId, resource.id, st.value)}
                      className={`px-2.5 py-1 rounded-[6px] text-[12px] leading-[16px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-[var(--surface)] text-[var(--text)]'
                          : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface)]/70 hover:text-[var(--text)]'
                      }`}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
              {resource.type === 'pdf' && (resource.isOcr || resource.isMapReduce) && (
                <span className="text-[12px] leading-[16px] text-[var(--text-muted)]">
                  {resource.isOcr ? 'OCR cục bộ' : 'Tóm tắt Map-Reduce'}
                </span>
              )}
            </div>

            {project ? (
              <CitationMarkdown
                content={resource.summaryByStyle[resource.activeSummaryStyle]}
                project={project}
                targetResourceId={resource.type === 'pdf' ? resource.id : undefined}
                compact
              />
            ) : (
              <div className="markdown-content markdown-compact">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {resource.summaryByStyle[resource.activeSummaryStyle]}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: solution-tab (2-column grid + shared global footer) */}
        {activeTab === 'solution' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {resource.solutions.map((sol, idx) => {
                const isOptimal = idx === 0;
                const isChosen = resource.selectedSolutionId === sol.id;
                return (
                  <div
                    key={sol.id}
                    className={`rounded-[10px] bg-[var(--surface)] p-3 flex flex-col gap-2.5 ${
                      isChosen ? 'ring-1 ring-[var(--success-fg)]/45' : ''
                    }`}
                  >
                    {/* header: left "Giải pháp i", right "Đề xuất" ONLY on first card */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] leading-[20px] font-bold text-[var(--text)]">
                        Giải pháp {idx + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isChosen && (
                          <span className="px-2 py-0.5 rounded-[6px] bg-[var(--success-bg)] text-[var(--success-fg)] text-[11px] leading-[16px] font-semibold inline-flex items-center gap-1 whitespace-nowrap">
                            <IconCheck size={12} stroke={2.25} />
                            <span>Đã gửi</span>
                          </span>
                        )}
                        {isOptimal && (
                          <span className="px-2 py-0.5 rounded-[6px] bg-[var(--surface-control)] text-[var(--accent-ink)] text-[12px] leading-[16px] font-semibold whitespace-nowrap">
                            Đề xuất
                          </span>
                        )}
                      </div>
                    </div>

                    {/* content: 2 markdown views (title+body & pros/cons) */}
                    <div className="flex flex-col gap-2.5 flex-1">
                      <div className="markdown-content markdown-compact">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{sol.titleMarkdown}</ReactMarkdown>
                      </div>
                      <div className="h-px w-full bg-[var(--divider)]" />
                      <div className="markdown-content markdown-compact">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {sol.prosConsMarkdown}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {/* Per-solution select action -> opens ReplyMailDialog */}
                    <div className="pt-1 border-t border-[var(--divider)] flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setReplySolutionTarget({ solution: sol, index: idx })}
                        className={`h-8 px-3 rounded-[8px] text-[12px] leading-[16px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          isChosen
                            ? 'bg-[var(--surface-control)] text-[var(--text)] hover:bg-[var(--surface-card-hover)]'
                            : isOptimal
                              ? 'bg-[#FCA311] text-[#14213D] hover:bg-[var(--accent-hover)]'
                              : 'bg-[var(--surface-control)] text-[var(--text)] hover:bg-[#FCA311] hover:text-[#14213D]'
                        }`}
                      >
                        <IconMailForward size={14} stroke={1.9} />
                        <span>{isChosen ? 'Soạn lại' : 'Chọn'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* solution-tab.footer: horizontal — global input "Thêm ràng buộc" + button "Đề xuất lại" */}
            <div className="flex items-center gap-2 pt-0.5">
              <input
                type="text"
                value={constraintInput}
                onChange={(e) => setConstraintInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isRegeneratingSolutions) {
                    regenerateSolutions(projectId, resource.id, constraintInput);
                    setConstraintInput('');
                  }
                }}
                placeholder="Thêm ràng buộc"
                aria-label="Thêm ràng buộc để đề xuất lại toàn bộ giải pháp"
                className="flex-1 min-w-0 h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] leading-[18px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
              />
              <button
                type="button"
                disabled={isRegeneratingSolutions}
                onClick={() => {
                  regenerateSolutions(projectId, resource.id, constraintInput);
                  setConstraintInput('');
                }}
                className="h-9 px-3.5 rounded-[8px] bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)] text-[13px] leading-[18px] font-semibold hover:bg-[var(--primary-btn-hover)] disabled:opacity-60 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isRegeneratingSolutions && <IconLoader2 size={14} className="animate-spin" />}
                <span>Đề xuất lại</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: schedule-tab */}
        {activeTab === 'schedule' && (
          <div className="flex flex-col gap-3">
            {/* Tiêu đề lịch */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`sched-title-${resource.id}`}
                className="text-[13px] leading-[18px] font-semibold text-[var(--text)]"
              >
                Tiêu đề lịch
              </label>
              <input
                id={`sched-title-${resource.id}`}
                type="text"
                value={schedule.title}
                onChange={(e) => {
                  updateScheduleDraft(projectId, resource.id, { title: e.target.value });
                  if (scheduleError) setScheduleError(null);
                }}
                placeholder="Nhập tiêu đề"
                className={`w-full h-9 px-3 rounded-t-[8px] rounded-b-none border-0 border-b text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] transition-colors focus:outline-none focus:border-[#FCA311] ${
                  hasScheduleTitle
                    ? 'bg-[var(--surface-control)] hover:bg-[var(--surface-control-hover)] border-[var(--border-hover)]'
                    : 'bg-transparent hover:bg-[var(--surface)]/70 border-[var(--border)]'
                }`}
              />
            </div>

            {/* Horizontal: calendar-component left, startime + endtime right */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                aria-label="Ngày diễn ra"
                value={schedule.date}
                onChange={(e) => {
                  updateScheduleDraft(projectId, resource.id, { date: e.target.value });
                  if (scheduleError) setScheduleError(null);
                }}
                className="flex-1 min-w-[132px] h-9 px-2.5 rounded-[8px] bg-[var(--surface-control)] hover:bg-[var(--surface-control-hover)] text-[13px] text-[var(--text)] tabular-nums transition-colors cursor-pointer"
              />
              {!schedule.allDay && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="time"
                    aria-label="Giờ bắt đầu"
                    value={schedule.startTime}
                    onChange={(e) => {
                      updateScheduleDraft(projectId, resource.id, { startTime: e.target.value });
                      if (scheduleError) setScheduleError(null);
                    }}
                    className="h-9 px-2 rounded-[8px] bg-[var(--surface-control)] hover:bg-[var(--surface-control-hover)] text-[13px] text-[var(--text)] tabular-nums transition-colors cursor-pointer"
                  />
                  <span className="text-[13px] text-[var(--text-muted)]">–</span>
                  <input
                    type="time"
                    aria-label="Giờ kết thúc"
                    value={schedule.endTime}
                    onChange={(e) => {
                      updateScheduleDraft(projectId, resource.id, { endTime: e.target.value });
                      if (scheduleError) setScheduleError(null);
                    }}
                    className="h-9 px-2 rounded-[8px] bg-[var(--surface-control)] hover:bg-[var(--surface-control-hover)] text-[13px] text-[var(--text)] tabular-nums transition-colors cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Conflict warning (UC_04.A5) with Redundancy: icon + text + warning tint */}
            {conflictingEvent && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-[8px] bg-[var(--warning-bg)] text-[var(--warning-fg)]">
                <IconAlertTriangleFilled
                  size={16}
                  className="shrink-0 mt-0.5 text-[var(--warning-icon)]"
                />
                <div className="text-[12px] leading-[18px]">
                  <span className="font-semibold">Trùng khung giờ:</span> Đã có sự kiện{' '}
                  <span className="font-semibold">"{conflictingEvent.title}"</span> (
                  {conflictingEvent.startTime}–{conflictingEvent.endTime}). Bạn có thể đổi giờ hoặc
                  vẫn giữ nguyên để duyệt.
                </div>
              </div>
            )}

            {/* Horizontal: checkbox "Tất cả các ngày" + repeat select-box */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="inline-flex items-center gap-2 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={schedule.allDay}
                  onChange={(e) =>
                    updateScheduleDraft(projectId, resource.id, { allDay: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#FCA311] cursor-pointer"
                />
                <span className="text-[13px] leading-[18px] text-[var(--text-body)]">
                  Tất cả các ngày
                </span>
              </label>

              <select
                aria-label="Tần suất lặp lại"
                value={schedule.repeat}
                onChange={(e) => handleRepeatSelect(e.target.value as RepeatOption)}
                className="flex-1 min-w-[175px] h-9 px-2.5 rounded-[8px] bg-[var(--surface-control)] hover:bg-[var(--surface-control-hover)] text-[13px] text-[var(--text)] transition-colors cursor-pointer"
              >
                {REPEAT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {schedule.repeat === 'Custom...' && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-[8px] bg-[var(--surface)]">
                <span className="text-[12px] leading-[18px] text-[var(--text-body)] truncate">
                  {formatRepeatSummary(schedule.repeat, schedule.customRepeat)}
                </span>
                <button
                  type="button"
                  onClick={() => setCustomRepeatOpen(true)}
                  className="text-[12px] font-semibold text-[var(--accent-ink)] hover:underline whitespace-nowrap cursor-pointer"
                >
                  Chỉnh sửa
                </button>
              </div>
            )}

            {/* Thêm hạn chót (ghost button -> horizontal "Hạn" + calendar + x icon) */}
            {!schedule.hasDeadline ? (
              <div>
                <button
                  type="button"
                  onClick={() =>
                    updateScheduleDraft(projectId, resource.id, {
                      hasDeadline: true,
                      deadlineDate: schedule.deadlineDate || schedule.date || '2026-11-30',
                    })
                  }
                  className="px-2.5 py-1.5 rounded-[8px] bg-transparent text-[13px] leading-[18px] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <IconCalendarPlus size={16} stroke={1.75} />
                  <span>Thêm hạn chót</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-[13px] leading-[18px] font-semibold text-[var(--text)]">
                    Hạn
                  </span>
                  <input
                    type="date"
                    aria-label="Ngày hạn chót"
                    value={schedule.deadlineDate}
                    onChange={(e) =>
                      updateScheduleDraft(projectId, resource.id, { deadlineDate: e.target.value })
                    }
                    className="h-9 px-2.5 rounded-[8px] bg-[var(--surface-control)] hover:bg-[var(--surface-control-hover)] text-[13px] text-[var(--text)] tabular-nums transition-colors cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  aria-label="Bỏ hạn chót"
                  title="Bỏ hạn chót"
                  onClick={() =>
                    updateScheduleDraft(projectId, resource.id, { hasDeadline: false })
                  }
                  className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  <IconX size={16} stroke={1.75} />
                </button>
              </div>
            )}

            {/* text-area: thêm mô tả (ghost border-bottom -> filled low-saturation primary + border-bottom when populated, auto-expand height) */}
            <textarea
              ref={descriptionRef}
              rows={1}
              value={schedule.description}
              onChange={(e) =>
                updateScheduleDraft(projectId, resource.id, { description: e.target.value })
              }
              placeholder="Thêm mô tả"
              aria-label="Mô tả sự kiện"
              className={`w-full min-h-[40px] px-3 py-2 rounded-t-[8px] rounded-b-none border-0 border-b text-[13px] leading-[20px] text-[var(--text)] placeholder:text-[var(--text-muted)] resize-none overflow-hidden transition-colors focus:outline-none focus:border-[#FCA311] ${
                hasScheduleDescription
                  ? 'bg-[var(--surface-control)] hover:bg-[var(--surface-control-hover)] border-[var(--border-hover)]'
                  : 'bg-transparent hover:bg-[var(--surface)]/70 border-[var(--border)]'
              }`}
            />

            {scheduleError && (
              <p className="text-[12px] leading-[18px] font-semibold text-[var(--destroy-fg)]">
                {scheduleError}
              </p>
            )}

            {/* Right-aligned button: Duyệt và tạo lịch */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              {schedule.isApproved ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] leading-[18px] font-semibold text-[var(--success-fg)]">
                  <IconCheck size={15} stroke={2} />
                  <span>Đã duyệt vào lịch</span>
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleApproveSchedule}
                className="h-9 px-4 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[13px] leading-[18px] font-semibold hover:bg-[var(--accent-hover)] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <IconCalendarCheck size={16} stroke={2} />
                <span>Duyệt và tạo lịch</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <CustomRepeatDialog
        open={customRepeatOpen}
        initialValue={schedule.customRepeat}
        onSave={(val) =>
          updateScheduleDraft(projectId, resource.id, {
            repeat: 'Custom...',
            customRepeat: val,
          })
        }
        onClose={() => setCustomRepeatOpen(false)}
      />

      {project && replySolutionTarget && (
        <ReplyMailDialog
          open={Boolean(replySolutionTarget)}
          onClose={() => setReplySolutionTarget(null)}
          project={project}
          resource={resource}
          solution={replySolutionTarget.solution}
          solutionIndex={replySolutionTarget.index}
        />
      )}
    </div>
  );
}
