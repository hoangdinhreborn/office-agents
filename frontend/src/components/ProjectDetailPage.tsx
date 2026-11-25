import {
  IconAdjustments,
  IconAdjustmentsFilled,
  IconArchive,
  IconArchiveFilled,
  IconFileTypePdf,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconTag,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildMailOverviewReport, MAIL_OVERVIEW_REPORT_ID } from '../lib/mailOverviewReport';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type {
  MemberRole,
  PdfResource,
  ProjectConfig,
  ProjectMember,
} from '../types/workspace';
import { memberEmailSchema, truncate30 } from '../utils/format';
import { ChatPanel } from './ChatPanel';
import { PdfViewerPanel } from './PdfViewerPanel';
import { ResourcePanel } from './ResourcePanel';

export function ProjectDetailPage() {
  const projects = useWorkspaceStore((s) => s.projects);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const rightTabOpen = useWorkspaceStore((s) => s.rightTabOpen);
  const pdfViewer = useWorkspaceStore((s) => s.pdfViewer);
  const openProjectDetail = useWorkspaceStore((s) => s.openProjectDetail);
  const openProjectsList = useWorkspaceStore((s) => s.openProjectsList);
  const setRightTabOpen = useWorkspaceStore((s) => s.setRightTabOpen);
  const openMailOverviewReportPdf = useWorkspaceStore((s) => s.openMailOverviewReportPdf);
  const closePdfViewer = useWorkspaceStore((s) => s.closePdfViewer);
  const updateProjectConfig = useWorkspaceStore((s) => s.updateProjectConfig);
  const mailboxLabels = useWorkspaceStore((s) => s.mailboxLabels);
  const isFetchingMailboxLabels = useWorkspaceStore((s) => s.isFetchingMailboxLabels);
  const fetchMailboxLabels = useWorkspaceStore((s) => s.fetchMailboxLabels);
  const createMailboxLabel = useWorkspaceStore((s) => s.createMailboxLabel);

  const project = projects.find((p) => p.id === activeProjectId) ?? null;

  const mailOverviewReport = useMemo(
    () => (project ? buildMailOverviewReport(project) : null),
    [project]
  );

  const isMailReportOpen = Boolean(
    project &&
      pdfViewer &&
      pdfViewer.projectId === project.id &&
      pdfViewer.resourceId === MAIL_OVERVIEW_REPORT_ID
  );

  const activePdfForViewer = useMemo(() => {
    if (!project || !pdfViewer || pdfViewer.projectId !== project.id) return null;
    if (pdfViewer.resourceId === MAIL_OVERVIEW_REPORT_ID) {
      return mailOverviewReport?.reportPdf ?? null;
    }
    return (
      project.resources.flatMap((r): PdfResource[] => r.type === 'pdf' ? [r] : r.attachedPdfs || [])
        .find((r) => r.id === pdfViewer.resourceId) ?? null
    );
  }, [project, pdfViewer, mailOverviewReport]);

  // Dynamic max-content minimum widths for both split panes & user-dragged right width
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1180);
  const [minLeftWidth, setMinLeftWidth] = useState(440);
  const [minRightWidth, setMinRightWidth] = useState(456);
  const [userRightWidth, setUserRightWidth] = useState<number | null>(null);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const handleMeasureLeftMin = useCallback((w: number) => {
    setMinLeftWidth((prev) => (Math.abs(prev - w) > 2 ? w : prev));
  }, []);

  const handleMeasureRightMin = useCallback((w: number) => {
    setMinRightWidth((prev) => (Math.abs(prev - w) > 2 ? w : prev));
  }, []);

  useEffect(() => {
    const el = splitContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clampRightWidth = useCallback(
    (desiredWidth: number) => {
      const effectiveMinRight = Math.min(minRightWidth, Math.max(320, containerWidth - 320));
      const maxRight = Math.max(effectiveMinRight, containerWidth - minLeftWidth);
      return Math.round(Math.min(maxRight, Math.max(effectiveMinRight, desiredWidth)));
    },
    [containerWidth, minLeftWidth, minRightWidth]
  );

  // Add breathing room on initial open; keep manual sizing and viewport bounds.
  const effectiveRightWidth = useMemo(() => {
    const base =
      userRightWidth ?? ((activePdfForViewer ? Math.max(minRightWidth, 540) : minRightWidth) + 50);
    return clampRightWidth(base);
  }, [userRightWidth, activePdfForViewer, minRightWidth, clampRightWidth]);

  useEffect(() => {
    if (!isDraggingSplit) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = splitContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const desired = rect.right - e.clientX;
      setUserRightWidth(clampRightWidth(desired));
    };

    const handlePointerUp = () => {
      setIsDraggingSplit(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDraggingSplit, clampRightWidth]);

  const showRightPane = Boolean((activePdfForViewer && pdfViewer) || rightTabOpen);
  const isPdfWide =
    Boolean(activePdfForViewer) &&
    effectiveRightWidth >= Math.min(720, containerWidth - minLeftWidth - 20);

  const handleTogglePdfWide = useCallback(() => {
    if (isPdfWide) {
      setUserRightWidth(minRightWidth);
    } else {
      setUserRightWidth(clampRightWidth(760));
    }
  }, [isPdfWide, minRightWidth, clampRightWidth]);

  const [configOpen, setConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingLabel, setSavingLabel] = useState(false);
  const [configDraft, setConfigDraft] = useState<ProjectConfig | null>(null);
  const [membersDraft, setMembersDraft] = useState<ProjectMember[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [creatingConfigLabel, setCreatingConfigLabel] = useState(false);
  const [newConfigLabelName, setNewConfigLabelName] = useState('');

  useEffect(() => {
    if (configOpen && project) {
      setConfigDraft({ ...project.config });
      setMembersDraft([...project.members]);
      setNewMemberEmail('');
      setMemberError(null);
      setCreatingConfigLabel(false);
      setNewConfigLabelName('');
    }
  }, [configOpen, project?.id]);

  useEffect(() => {
    if (!configOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfigOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [configOpen]);

  if (!project) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-[var(--bg)]">
        <p className="text-[18px] font-semibold text-[var(--text)]">Không tìm thấy dự án đang chọn</p>
        <button
          type="button"
          onClick={openProjectsList}
          className="px-4 py-2 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[14px] font-semibold hover:bg-[var(--accent-hover)] cursor-pointer"
        >
          Quay về danh sách dự án
        </button>
      </div>
    );
  }

  const handleAddConfigMember = () => {
    const parsed = memberEmailSchema.safeParse(newMemberEmail);
    if (!parsed.success) {
      setMemberError(parsed.error.issues[0]?.message ?? 'Email không hợp lệ.');
      return;
    }
    const normalized = parsed.data.toLowerCase();
    if (membersDraft.some((m) => m.email.toLowerCase() === normalized)) {
      setMemberError('Email đã tồn tại trong dự án.');
      return;
    }
    setMembersDraft((prev) => [
      {
        id: `m-cfg-${Date.now()}-${prev.length}`,
        email: normalized,
        role: normalized.endsWith('@soviectech.vn') ? 'nội bộ' : 'khách',
      },
      ...prev,
    ]);
    setNewMemberEmail('');
    setMemberError(null);
  };

  const handleCreateConfigLabel = async () => {
    if (savingLabel || !newConfigLabelName.trim()) return;
    setSavingLabel(true);
    const created = await createMailboxLabel(newConfigLabelName);
    setSavingLabel(false);
    if (!created) return;
    setConfigDraft((prev) => prev ? { ...prev, mailLabelId: created.id, mailLabelName: created.name, imapFolder: created.name } : prev);
    setCreatingConfigLabel(false);
    setNewConfigLabelName('');
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg)]">
      {/* project-page/id.header: horizontal — left outline select-box, right Tài nguyên (filled) + Cấu hình (outline) */}
      <header className="h-[64px] shrink-0 px-6 flex items-center justify-between gap-4">
        <select
          aria-label="Chuyển dự án"
          value={project.id}
          onChange={(e) => openProjectDetail(e.target.value, rightTabOpen, null)}
          className="h-10 max-w-[340px] px-3.5 rounded-[8px] bg-transparent border border-[var(--border)] text-[15px] leading-[22px] font-semibold text-[var(--text)] hover:border-[var(--border-hover)] cursor-pointer truncate"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Icon-only PDF overview report toggle button (mutually exclusive with Tài nguyên) */}
          <button
            type="button"
            aria-label="Xem báo cáo PDF tổng quan trong ngày"
            title="Báo cáo tổng quan trong ngày (PDF)"
            aria-pressed={isMailReportOpen}
            onClick={() => {
              if (isMailReportOpen) {
                closePdfViewer();
              } else {
                openMailOverviewReportPdf(project.id);
              }
            }}
            className={`w-10 h-10 rounded-[8px] flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
              isMailReportOpen
                ? 'bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)] hover:bg-[var(--primary-btn-hover)]'
                : 'bg-[var(--surface-card)] text-[var(--text-body)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
            }`}
          >
            <IconFileTypePdf size={19} stroke={1.75} />
          </button>

          {/* Tài nguyên button (archive icon: filled when resource list active, outline otherwise) */}
          <button
            type="button"
            aria-pressed={rightTabOpen && !activePdfForViewer}
            onClick={() => {
              if (activePdfForViewer) {
                closePdfViewer();
                setRightTabOpen(true);
              } else {
                setRightTabOpen(!rightTabOpen);
              }
            }}
            className={`h-10 px-4 rounded-[8px] text-[14px] leading-[20px] font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              rightTabOpen && !activePdfForViewer
                ? 'bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)] hover:bg-[var(--primary-btn-hover)]'
                : 'bg-[var(--surface-card)] text-[var(--text-body)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
            }`}
          >
            {rightTabOpen && !activePdfForViewer ? (
              <IconArchiveFilled size={18} />
            ) : (
              <IconArchive size={18} stroke={1.75} />
            )}
            <span>Tài nguyên</span>
          </button>

          {/* Cấu hình button (adjustments icon, outline) */}
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            className="h-10 px-4 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] leading-[20px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {configOpen ? (
              <IconAdjustmentsFilled size={18} />
            ) : (
              <IconAdjustments size={18} stroke={1.75} />
            )}
            <span>Cấu hình</span>
          </button>
        </div>
      </header>

      <div className="h-px w-full bg-[var(--divider)] shrink-0" />

      {/* Split Workspace: content-left-tab + hover-revealed drag handle + (PdfViewerPanel OR content-right-tab) */}
      <div ref={splitContainerRef} className="flex-1 min-h-0 flex overflow-hidden relative">
        <div
          className="flex-1 h-full flex overflow-hidden"
          style={{ minWidth: showRightPane ? `${minLeftWidth}px` : 0 }}
        >
          <ChatPanel project={project} onMeasureMinWidth={handleMeasureLeftMin} />
        </div>

        {showRightPane && (
          <>
            {/* Hover-revealed split resize handle between left and right sidebars */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Kéo để thay đổi chiều rộng khung Tài nguyên và Hội thoại"
              title="Kéo để chỉnh chiều rộng (nhấp đúp để về kích thước mặc định)"
              onPointerDown={(e) => {
                e.preventDefault();
                setIsDraggingSplit(true);
              }}
              onDoubleClick={() => setUserRightWidth(null)}
              className="group relative w-[9px] -mx-[4px] z-20 shrink-0 cursor-col-resize flex items-center justify-center select-none"
            >
              {/* Subtle resting hairline */}
              <div
                className={`h-full transition-all duration-150 ${
                  isDraggingSplit
                    ? 'w-[3px] bg-[#FCA311]'
                    : 'w-px bg-[var(--divider)] group-hover:w-[3px] group-hover:bg-[#FCA311]/75'
                }`}
              />
              {/* Centered grab indicator revealed on hover / drag */}
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-[5px] h-10 rounded-full transition-opacity duration-150 ${
                  isDraggingSplit
                    ? 'opacity-100 bg-[#FCA311]'
                    : 'opacity-0 group-hover:opacity-100 bg-[#FCA311]'
                }`}
              />
            </div>

            <div
              className="h-full shrink-0 overflow-hidden"
              style={{
                width: `${effectiveRightWidth}px`,
                minWidth: `${Math.min(minRightWidth, effectiveRightWidth)}px`,
              }}
            >
              {activePdfForViewer && pdfViewer ? (
                <PdfViewerPanel
                  pdf={activePdfForViewer}
                  viewerState={pdfViewer}
                  isWide={isPdfWide}
                  onToggleWide={handleTogglePdfWide}
                />
              ) : (
                <ResourcePanel project={project} onMeasureMinWidth={handleMeasureRightMin} />
              )}
            </div>
          </>
        )}
      </div>

      {/* Project Configuration Dialog */}
      {configOpen && configDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4"
          onClick={() => setConfigOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-config-title"
        >
          <div
            className="w-full max-w-[500px] rounded-[16px] bg-[var(--surface)] elevated-container flex flex-col max-h-[86vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 shrink-0">
              <h3
                id="project-config-title"
                className="text-[20px] leading-[24px] font-semibold text-[var(--text)]"
              >
                Cấu hình dự án
              </h3>
              <button
                type="button"
                aria-label="Đóng cấu hình"
                onClick={() => setConfigOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] cursor-pointer"
              >
                <IconX size={20} stroke={1.75} />
              </button>
            </div>

            <div className="h-px w-full bg-[var(--divider)] shrink-0" />

            <div className="p-6 scroll-area flex flex-col gap-5">
              {/* Linked Mailbox Label (1 Project = 1 Mail Label) */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="project-mail-label-select"
                    className="text-[14px] leading-[20px] font-semibold text-[var(--text)] inline-flex items-center gap-1.5"
                  >
                    <IconTag size={15} stroke={1.9} className="text-[var(--accent-ink)]" />
                    <span>Nhãn email liên kết</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingConfigLabel((v) => !v);
                      setNewConfigLabelName('');
                    }}
                    className="text-[12px] font-semibold text-[var(--accent-ink)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <IconPlus size={13} stroke={2} />
                    <span>{creatingConfigLabel ? 'Chọn nhãn có sẵn' : 'Tạo nhãn mới'}</span>
                  </button>
                </div>

                {creatingConfigLabel ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newConfigLabelName}
                      onChange={(e) => setNewConfigLabelName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); void handleCreateConfigLabel(); }
                      }}
                      placeholder="Nhập tên nhãn email mới (vd: HopDong-Q1)"
                      className="flex-1 min-w-0 h-10 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                    />
                    <button
                      type="button"
                      disabled={savingLabel || !newConfigLabelName.trim()}
                      onClick={() => void handleCreateConfigLabel()}
                      className="h-10 px-3.5 rounded-[8px] bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)] text-[13px] font-semibold hover:bg-[var(--primary-btn-hover)] disabled:opacity-50 shrink-0 cursor-pointer"
                    >
                      Tạo
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      id="project-mail-label-select"
                      value={configDraft.mailLabelId ?? ''}
                      onChange={(e) => {
                        const found = mailboxLabels.find((l) => l.id === e.target.value);
                        if (!found) return;
                        setConfigDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                mailLabelId: found.id,
                                mailLabelName: found.name,
                                imapFolder: `INBOX/${found.name}`,
                              }
                            : prev
                        );
                      }}
                      className="flex-1 min-w-0 h-10 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] text-[var(--text)] hover:border-[var(--border-hover)] cursor-pointer"
                    >
                      {mailboxLabels.map((lbl) => {
                        const otherOwner = projects.find(
                          (p) => p.id !== project.id && p.config.mailLabelId === lbl.id
                        );
                        return (
                          <option key={lbl.id} value={lbl.id}>
                            {lbl.name}
                            {otherOwner ? ` — Đang gắn: ${otherOwner.title}` : ''}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      disabled={isFetchingMailboxLabels}
                      onClick={() => fetchMailboxLabels()}
                      title="Tải danh sách nhãn mới nhất từ hộp thư"
                      className="h-10 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      {isFetchingMailboxLabels ? (
                        <IconLoader2 size={15} className="animate-spin text-[var(--accent-ink)]" />
                      ) : (
                        <IconRefresh size={15} stroke={1.75} />
                      )}
                      <span>Tải nhãn</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Auto mail sync interval & default reminder */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="mail-sync-interval-select"
                    className="text-[14px] leading-[20px] font-semibold text-[var(--text)]"
                  >
                    Đồng bộ mail
                  </label>
                  <select
                    id="mail-sync-interval-select"
                    value={configDraft.mailSyncIntervalMinutes ?? 60}
                    onChange={(e) =>
                      setConfigDraft((prev) =>
                        prev
                          ? { ...prev, mailSyncIntervalMinutes: Number(e.target.value) }
                          : prev
                      )
                    }
                    className="h-10 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] text-[var(--text)] tabular-nums cursor-pointer"
                  >
                    <option value={30}>Mỗi 30 phút</option>
                    <option value={60}>Mỗi 1 tiếng</option>
                    <option value={120}>Mỗi 2 tiếng</option>
                    <option value={240}>Mỗi 4 tiếng</option>
                    <option value={360}>Mỗi 6 tiếng</option>
                    <option value={720}>Mỗi 12 tiếng</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="default-reminder-select"
                    className="text-[14px] leading-[20px] font-semibold text-[var(--text)]"
                  >
                    Nhắc lịch trước
                  </label>
                  <select
                    id="default-reminder-select"
                    value={configDraft.defaultReminderMinutes}
                    onChange={(e) =>
                      setConfigDraft((prev) =>
                        prev
                          ? { ...prev, defaultReminderMinutes: Number(e.target.value) }
                          : prev
                      )
                    }
                    className="h-10 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] text-[var(--text)] tabular-nums cursor-pointer"
                  >
                    <option value={10}>10 phút</option>
                    <option value={15}>15 phút</option>
                    <option value={30}>30 phút</option>
                    <option value={60}>60 phút</option>
                  </select>
                </div>
              </div>

              {/* RL feedback collection toggle */}
              <label className="flex items-center justify-between gap-3 rounded-[10px] bg-[var(--surface-recessed)] px-4 py-3 cursor-pointer">
                <div className="flex flex-col">
                  <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)]">
                    Thu nhận phản hồi cải thiện mô hình cục bộ
                  </span>
                  <span className="text-[12px] leading-[18px] text-[var(--text-muted)]">
                    Hiển thị nút đánh giá trên câu trả lời để làm tín hiệu thưởng học tăng cường.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={configDraft.collectRlFeedback}
                  onChange={(e) =>
                    setConfigDraft((prev) =>
                      prev ? { ...prev, collectRlFeedback: e.target.checked } : prev
                    )
                  }
                  className="w-4 h-4 accent-[#FCA311] shrink-0 cursor-pointer"
                />
              </label>

              {/* Members whitelist management */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)]">
                    Danh sách địa chỉ email theo dõi
                  </span>
                  <button
                    type="button"
                    onClick={handleAddConfigMember}
                    className="px-3.5 py-1.5 rounded-[8px] bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)] text-[13px] font-semibold hover:bg-[var(--primary-btn-hover)] cursor-pointer"
                  >
                    Thêm
                  </button>
                </div>
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => {
                    setNewMemberEmail(e.target.value);
                    if (memberError) setMemberError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddConfigMember();
                    }
                  }}
                  placeholder="Nhập địa chỉ mail thành viên"
                  className="w-full h-10 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                />
                {memberError && (
                  <p className="text-[12px] font-semibold text-[var(--destroy-fg)]">{memberError}</p>
                )}

                <div className="scroll-area max-h-[150px] rounded-[10px] bg-[var(--surface-recessed)] p-2 flex flex-col gap-1">
                  {membersDraft.length === 0 ? (
                    <p className="py-4 text-center text-[13px] text-[var(--text-muted)]">
                      Chưa có địa chỉ email nào được cấu hình.
                    </p>
                  ) : (
                    membersDraft.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-[8px] bg-transparent hover:bg-[var(--surface-card-hover)] transition-colors"
                      >
                        <span
                          title={m.email}
                          className="text-[13px] font-mono text-[var(--text-body)] whitespace-nowrap"
                        >
                          {truncate30(m.email)}
                        </span>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Vai trò của ${m.email}`}
                            value={m.role}
                            onChange={(e) =>
                              setMembersDraft((prev) =>
                                prev.map((item) =>
                                  item.id === m.id
                                    ? { ...item, role: e.target.value as MemberRole }
                                    : item
                                )
                              )
                            }
                            className="h-8 px-2 rounded-[8px] bg-transparent border border-[var(--border)] text-[12px] font-semibold text-[var(--text)] cursor-pointer"
                          >
                            <option value="nội bộ">nội bộ</option>
                            <option value="khách">khách</option>
                          </select>
                          <button
                            type="button"
                            aria-label={`Xóa ${m.email}`}
                            onClick={() =>
                              setMembersDraft((prev) => prev.filter((item) => item.id !== m.id))
                            }
                            className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--destroy-bg)] hover:text-[var(--destroy-fg-hover)] cursor-pointer"
                          >
                            <IconX size={15} stroke={1.75} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="h-px w-full bg-[var(--divider)] shrink-0" />

            <div className="flex items-center justify-end gap-3 px-6 py-4 shrink-0">
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                className="px-4 py-2 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={savingConfig || savingLabel}
                onClick={async () => {
                  if (savingConfig) return;
                  setSavingConfig(true);
                  const saved = await updateProjectConfig(project.id, configDraft, membersDraft);
                  setSavingConfig(false);
                  if (saved) setConfigOpen(false);
                }}
                className="px-5 py-2 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[14px] font-semibold hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                Lưu cấu hình
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
