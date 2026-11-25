import {
  IconArrowsSort,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconEyeFilled,
  IconFileTypePdf,
  IconLayoutBottombar,
  IconLayoutBottombarFilled,
  IconLoader2,
  IconPaperclip,
  IconRefresh,
} from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type {
  Project,
  ResourceItem,
  ResourceViewMode,
  SortMode,
} from '../types/workspace';
import { getWeekGroupKey, truncate18 } from '../utils/format';
import { ResourceToolbar } from './ResourceToolbar';

interface ResourcePanelProps {
  project: Project;
  onMeasureMinWidth?: (minWidth: number) => void;
}

const RESOURCE_SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'date_desc', label: 'Thời gian: Mới nhất' },
  { value: 'date_asc', label: 'Thời gian: Cũ nhất' },
  { value: 'name_asc', label: 'Bảng chữ cái: A → Z' },
  { value: 'name_desc', label: 'Bảng chữ cái: Z → A' },
];

function getResourceSortName(item: ResourceItem): string {
  return item.type === 'pdf' ? item.fileName : item.subject;
}

function GmailLogoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M16.58,19.1068l-12.69-8.0757A3,3,0,0,1,7.1109,5.97l9.31,5.9243L24.78,6.0428A3,3,0,0,1,28.22,10.9579Z"
        fill="#ea4435"
      />
      <path
        d="M25.5,5.5h4a0,0,0,0,1,0,0v18a3,3,0,0,1-3,3h0a3,3,0,0,1-3-3V7.5a2,2,0,0,1,2-2Z"
        fill="#00ac47"
        transform="translate(53.0001 32.0007) rotate(180)"
      />
      <path
        d="M29.4562,8.0656c-.0088-.06-.0081-.1213-.0206-.1812-.0192-.0918-.0549-.1766-.0823-.2652a2.9312,2.9312,0,0,0-.0958-.2993c-.02-.0475-.0508-.0892-.0735-.1354A2.9838,2.9838,0,0,0,28.9686,6.8c-.04-.0581-.09-.1076-.1342-.1626a3.0282,3.0282,0,0,0-.2455-.2849c-.0665-.0647-.1423-.1188-.2146-.1771a3.02,3.02,0,0,0-.24-.1857c-.0793-.0518-.1661-.0917-.25-.1359-.0884-.0461-.175-.0963-.267-.1331-.0889-.0358-.1837-.0586-.2766-.0859s-.1853-.06-.2807-.0777a3.0543,3.0543,0,0,0-.357-.036c-.0759-.0053-.1511-.0186-.2273-.018a2.9778,2.9778,0,0,0-.4219.0425c-.0563.0084-.113.0077-.1689.0193a33.211,33.211,0,0,0-.5645.178c-.0515.022-.0966.0547-.1465.0795A2.901,2.901,0,0,0,23.5,8.5v5.762l4.72-3.3043a2.8878,2.8878,0,0,0,1.2359-2.8923Z"
        fill="#ffba00"
      />
      <path
        d="M5.5,5.5h0a3,3,0,0,1,3,3v18a0,0,0,0,1,0,0h-4a2,2,0,0,1-2-2V8.5a3,3,0,0,1,3-3Z"
        fill="#4285f4"
      />
      <path
        d="M2.5439,8.0656c.0088-.06.0081-.1213.0206-.1812.0192-.0918.0549-.1766.0823-.2652A2.9312,2.9312,0,0,1,2.7426,7.32c.02-.0475.0508-.0892.0736-.1354A2.9719,2.9719,0,0,1,3.0316,6.8c.04-.0581.09-.1076.1342-.1626a3.0272,3.0272,0,0,1,.2454-.2849c.0665-.0647.1423-.1188.2147-.1771a3.0005,3.0005,0,0,1,.24-.1857c.0793-.0518.1661-.0917.25-.1359A2.9747,2.9747,0,0,1,4.3829,5.72c.089-.0358.1838-.0586.2766-.0859s.1853-.06.2807-.0777a3.0565,3.0565,0,0,1,.357-.036c.076-.0053.1511-.0186.2273-.018a2.9763,2.9763,0,0,1,.4219.0425c.0563.0084.113.0077.169.0193a2.9056,2.9056,0,0,1,.286.0888,2.9157,2.9157,0,0,1,.2785.0892c.0514.022.0965.0547.1465.0795a2.9745,2.9745,0,0,1,.3742.21A2.9943,2.9943,0,0,1,8.5,8.5v5.762L3.78,10.9579A2.8891,2.8891,0,0,1,2.5439,8.0656Z"
        fill="#c52528"
      />
    </svg>
  );
}

export function ResourcePanel({ project, onMeasureMinWidth }: ResourcePanelProps) {
  const resourceSort = useWorkspaceStore((s) => s.resourceSort);
  const resourceViewMode = useWorkspaceStore((s) => s.resourceViewMode);
  const resourceInputSubTab = useWorkspaceStore((s) => s.resourceInputSubTab);
  const expandedToolbarByResourceId = useWorkspaceStore((s) => s.expandedToolbarByResourceId);
  const pdfViewer = useWorkspaceStore((s) => s.pdfViewer);
  const isSyncingMail = useWorkspaceStore((s) => s.isSyncingMail);

  const setResourceSort = useWorkspaceStore((s) => s.setResourceSort);
  const setResourceViewMode = useWorkspaceStore((s) => s.setResourceViewMode);
  const setResourceInputSubTab = useWorkspaceStore((s) => s.setResourceInputSubTab);
  const toggleResourceSelection = useWorkspaceStore((s) => s.toggleResourceSelection);
  const toggleAllResources = useWorkspaceStore((s) => s.toggleAllResources);
  const toggleResourceToolbar = useWorkspaceStore((s) => s.toggleResourceToolbar);
  const toggleAllResourceToolbars = useWorkspaceStore((s) => s.toggleAllResourceToolbars);
  const setResourceToolbarTab = useWorkspaceStore((s) => s.setResourceToolbarTab);
  const openPdfViewer = useWorkspaceStore((s) => s.openPdfViewer);
  const syncProjectEmails = useWorkspaceStore((s) => s.syncProjectEmails);
  const uploadPdfFile = useWorkspaceStore((s) => s.uploadPdfFile);
  const uploadSampleOcrPdf = useWorkspaceStore((s) => s.uploadSampleOcrPdf);

  const [sortOpen, setSortOpen] = useState(false);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});
  const sortRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolLeftRef = useRef<HTMLDivElement>(null);
  const toolRightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Measure natural max-content width of ResourcePanel controls so default & min width never clip content
  useLayoutEffect(() => {
    if (!onMeasureMinWidth) return;
    const measure = () => {
      const leftW = toolLeftRef.current?.scrollWidth ?? 210;
      const rightW = toolRightRef.current?.scrollWidth ?? 195;
      // 32px horizontal padding (p-4) + 12px gap between left and right tool groups + 6px buffer
      const toolRowMin = leftW + rightW + 50;
      // Ensure expanded toolbar (3 tabs + date/time pickers) fits comfortably without squeezing
      const toolbarFloor = 456;
      onMeasureMinWidth(Math.ceil(Math.max(toolRowMin, toolbarFloor)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [onMeasureMinWidth, project.resources.length, resourceViewMode]);

  const sortedResources = useMemo(() => {
    const list = [...project.resources];
    list.sort((a, b) => {
      switch (resourceSort) {
        case 'date_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'date_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name_asc':
          return getResourceSortName(a).localeCompare(getResourceSortName(b), 'vi');
        case 'name_desc':
          return getResourceSortName(b).localeCompare(getResourceSortName(a), 'vi');
      }
    });
    return list;
  }, [project.resources, resourceSort]);

  const weekGroups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; sortValue: number; items: ResourceItem[] }
    >();
    for (const item of sortedResources) {
      const wg = getWeekGroupKey(item.createdAt);
      const existing = map.get(wg.key);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(wg.key, { ...wg, items: [item] });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.sortValue - a.sortValue);
  }, [sortedResources]);

  const mailResources = useMemo(
    () => sortedResources.filter((r) => r.type === 'mail'),
    [sortedResources]
  );
  const pdfResources = useMemo(
    () => sortedResources.filter((r) => r.type === 'pdf'),
    [sortedResources]
  );

  const hasExpandedToolbar = useMemo(
    () => project.resources.some((r) => Boolean(expandedToolbarByResourceId[r.id])),
    [project.resources, expandedToolbarByResourceId]
  );

  const allSelected =
    project.resources.length > 0 && project.resources.every((r) => r.selected);

  const renderResourceWrapper = (item: ResourceItem) => {
    const activeToolbarTab = expandedToolbarByResourceId[item.id] ?? null;
    const isExpanded = Boolean(activeToolbarTab);

    return (
      <div
        key={item.id}
        className={`rounded-[12px] p-2.5 transition-colors ${
          isExpanded
            ? 'bg-[var(--surface-card-hover)]'
            : 'bg-[var(--surface)] hover:bg-[var(--surface-card-hover)]'
        }`}
      >
        <div className="group flex items-center gap-2.5">
          {/* wrapper checkbox */}
          <input
            type="checkbox"
            checked={item.selected}
            aria-label={`Chọn nguồn ${item.type === 'pdf' ? item.fileName : item.subject}`}
            onChange={() => toggleResourceSelection(project.id, item.id)}
            className="w-4 h-4 accent-[#14213D] dark:accent-[#A8B5CE] shrink-0 cursor-pointer"
          />

          {/* pdf-component or mail-component */}
          {item.type === 'pdf' ? (
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => openPdfViewer(project.id, item.id)}
                title={`Mở chế độ xem PDF: ${item.fileName}`}
                className="flex items-center gap-2.5 min-w-0 text-left bg-transparent cursor-pointer"
              >
                <span className="w-8 h-8 rounded-[8px] bg-transparent text-[var(--destroy-500)] flex items-center justify-center shrink-0">
                  <IconFileTypePdf size={20} stroke={1.75} />
                </span>
                <div className="min-w-0 flex flex-col">
                  <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)] group-hover:text-[var(--accent-ink)] transition-colors truncate">
                    {item.fileName}
                  </span>
                  <span className="text-[12px] leading-[16px] text-[var(--text-muted)] tabular-nums">
                    {item.fileSize} · {item.pageCount} trang
                  </span>
                </div>
              </button>

              {/* Hover-revealed PDF View Mode + layout-bottombar controls (selected = filled low-saturation primary) */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  aria-label={`Xem PDF ${item.fileName}`}
                  title="Chế độ xem PDF"
                  onClick={() => openPdfViewer(project.id, item.id)}
                  className={`w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                    pdfViewer?.resourceId === item.id
                      ? 'opacity-100 bg-[var(--surface-control-hover)] text-[var(--text)] hover:bg-[var(--surface-control)]'
                      : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-panel)] hover:text-[var(--text)]'
                  }`}
                >
                  {pdfViewer?.resourceId === item.id ? (
                    <IconEyeFilled size={18} />
                  ) : (
                    <IconEye size={18} stroke={1.75} />
                  )}
                </button>

                <button
                  type="button"
                  aria-label={`Mở thanh công cụ cho ${item.fileName}`}
                  title={
                    isExpanded
                      ? 'Đóng thanh công cụ'
                      : 'Mở thanh công cụ (Tóm tắt / Giải pháp / Đặt lịch)'
                  }
                  onClick={() => toggleResourceToolbar(item.id)}
                  className={`w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                    isExpanded
                      ? 'opacity-100 bg-[var(--surface-control-hover)] text-[var(--text)] hover:bg-[var(--surface-control)]'
                      : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-panel)] hover:text-[var(--text)]'
                  }`}
                >
                  {isExpanded ? (
                    <IconLayoutBottombarFilled size={18} />
                  ) : (
                    <IconLayoutBottombar size={18} stroke={1.75} />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-[8px] bg-transparent flex items-center justify-center shrink-0">
                  <GmailLogoIcon size={20} />
                </span>
                <div className="min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      title={item.senderEmail}
                      className="text-[13px] leading-[18px] font-semibold text-[var(--text)] whitespace-nowrap"
                    >
                      {truncate18(item.senderEmail)}
                    </span>
                    <span
                      title="Phân loại người gửi (thay đổi trong Cấu hình dự án)"
                      className="px-2 py-0.5 rounded-[6px] bg-[var(--surface-control)] text-[12px] leading-[16px] font-semibold text-[var(--text)] whitespace-nowrap shrink-0"
                    >
                      {item.senderRole}
                    </span>
                  </div>
                  <span
                    title={item.subject}
                    className="text-[13px] leading-[18px] text-[var(--text-body)] whitespace-nowrap"
                  >
                    {truncate18(item.subject)}
                  </span>
                </div>
              </div>

              {/* Hover-revealed layout-bottombar icon to expand wrapper toolbar */}
              <button
                type="button"
                aria-label={`Mở thanh công cụ cho email ${item.subject}`}
                title={
                  isExpanded
                    ? 'Đóng thanh công cụ'
                    : 'Mở thanh công cụ (Tóm tắt / Giải pháp / Đặt lịch)'
                }
                onClick={() => toggleResourceToolbar(item.id)}
                className={`w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                  isExpanded
                    ? 'opacity-100 bg-[var(--surface-control-hover)] text-[var(--text)] hover:bg-[var(--surface-control)]'
                    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-panel)] hover:text-[var(--text)]'
                }`}
              >
                {isExpanded ? (
                  <IconLayoutBottombarFilled size={18} />
                ) : (
                  <IconLayoutBottombar size={18} stroke={1.75} />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Expanded toolbar-component */}
        {isExpanded && activeToolbarTab && (
          <ResourceToolbar
            projectId={project.id}
            resource={item}
            activeTab={activeToolbarTab}
            onSelectTab={(tab) => setResourceToolbarTab(item.id, tab)}
          />
        )}
      </div>
    );
  };

  return (
    <aside
      aria-label="Tài nguyên dự án"
      className="w-full h-full bg-[var(--surface-panel)] flex flex-col overflow-hidden"
    >
      {/* Hidden native PDF file input for UC01.ingest */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            uploadPdfFile(project.id, file);
            e.target.value = '';
          }
        }}
      />

      {/* content-right-tab.header: stacked -> input-component + tool-component */}
      <div className="shrink-0 p-4 flex flex-col gap-3">
        {/* input-component: horizontal, equal buttons "Đồng bộ" & "Tải lên" */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={isSyncingMail}
            onClick={() => syncProjectEmails(project.id)}
            className="h-10 px-3 rounded-[8px] bg-[var(--surface)] text-[var(--text)] text-[14px] leading-[20px] font-semibold hover:bg-[var(--surface-card-hover)] disabled:opacity-65 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {isSyncingMail ? (
              <IconLoader2 size={17} stroke={1.75} className="animate-spin text-[var(--accent-ink)]" />
            ) : (
              <IconRefresh size={17} stroke={1.75} />
            )}
            <span>{isSyncingMail ? 'Đang đồng bộ...' : 'Đồng bộ'}</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-10 px-3 rounded-[8px] bg-[var(--surface)] text-[var(--text)] text-[14px] leading-[20px] font-semibold hover:bg-[var(--surface-card-hover)] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <IconPaperclip size={17} stroke={1.75} />
            <span>Tải lên</span>
          </button>
        </div>

        {/* tool-component: horizontal — left switch-button, right arrows-sort + global layout-bottombar + select-all checkbox */}
        <div className="flex items-center justify-between gap-2">
          {/* switch-button: Mặc định | Tuần | Đầu vào */}
          <div
            ref={toolLeftRef}
            role="tablist"
            aria-label="Chế độ xem tài nguyên"
            className="flex items-center gap-0.5 p-0.5 rounded-[8px] bg-[var(--surface-track)] shrink-0"
          >
            {(
              [
                { id: 'default', label: 'Mặc định' },
                { id: 'week', label: 'Tuần' },
                { id: 'input', label: 'Đầu vào' },
              ] as { id: ResourceViewMode; label: string }[]
            ).map((mode) => {
              const active = resourceViewMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setResourceViewMode(mode.id)}
                  className={`px-2.5 py-1 rounded-[6px] text-[12px] leading-[16px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[var(--surface)] text-[var(--text)]'
                      : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          <div ref={toolRightRef} className="flex items-center gap-1.5 shrink-0">
            <div className="relative" ref={sortRef}>
              <button
                type="button"
                aria-label="Sắp xếp tài nguyên"
                title="Sắp xếp tài nguyên"
                aria-expanded={sortOpen}
                onClick={() => setSortOpen((v) => !v)}
                className={`w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors cursor-pointer ${
                  sortOpen
                    ? 'bg-[var(--surface-control)] text-[var(--text)]'
                    : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
                }`}
              >
                <IconArrowsSort size={18} stroke={1.75} />
              </button>

              {sortOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-[210px] rounded-[12px] bg-[var(--surface)] elevated-container p-1.5 z-30 flex flex-col gap-0.5"
                >
                  {RESOURCE_SORT_OPTIONS.map((opt) => {
                    const active = resourceSort === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => {
                          setResourceSort(opt.value);
                          setSortOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-[8px] text-[13px] leading-[18px] transition-colors cursor-pointer ${
                          active
                            ? 'bg-[var(--surface-control)] text-[var(--text)] font-semibold'
                            : 'bg-transparent text-[var(--text-body)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
                        }`}
                      >
                        <span className="whitespace-nowrap">{opt.label}</span>
                        {active && (
                          <IconCheck size={15} stroke={2} className="text-[var(--accent-ink)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Global layout-bottombar toggle button (selected = filled low-saturation primary) */}
            <button
              type="button"
              disabled={project.resources.length === 0}
              aria-pressed={hasExpandedToolbar}
              aria-label={
                hasExpandedToolbar
                  ? 'Đóng toàn bộ thanh công cụ tài nguyên'
                  : 'Mở thanh công cụ toàn cục'
              }
              title={
                hasExpandedToolbar
                  ? 'Thu gọn tất cả thanh công cụ'
                  : 'Mở thanh công cụ toàn cục cho các nguồn đang chọn'
              }
              onClick={() => toggleAllResourceToolbars(project.id)}
              className={`w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                hasExpandedToolbar
                  ? 'bg-[var(--surface-control)] text-[var(--text)] hover:bg-[var(--surface-control-hover)]'
                  : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
              }`}
            >
              {hasExpandedToolbar ? (
                <IconLayoutBottombarFilled size={18} />
              ) : (
                <IconLayoutBottombar size={18} stroke={1.75} />
              )}
            </button>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap ml-0.5">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={project.resources.length === 0}
                onChange={(e) => toggleAllResources(project.id, e.target.checked)}
                className="w-4 h-4 accent-[#14213D] dark:accent-[#A8B5CE] shrink-0 cursor-pointer"
              />
              <span className="text-[12px] leading-[16px] font-semibold text-[var(--text-body)] whitespace-nowrap">
                {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="h-px w-full bg-[var(--divider)] shrink-0" />

      {/* content-right-tab.content (scroll enable) */}
      <div className="flex-1 min-h-0 scroll-area p-4">
        {project.resources.length === 0 ? (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center gap-3 px-4">
            <p className="text-[16px] leading-[24px] font-semibold text-[var(--text)]">
              Chưa có tài nguyên nào
            </p>
            <p className="text-[13px] leading-[20px] text-[var(--text-muted)]">
              Nhấn <strong className="text-[var(--text)]">Đồng bộ</strong> để đọc email từ thư mục cấu hình hoặc{' '}
              <strong className="text-[var(--text)]">Tải lên</strong> tệp PDF vào dự án.
            </p>
            <button
              type="button"
              onClick={() => uploadSampleOcrPdf(project.id)}
              className="mt-1 px-3.5 py-2 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] leading-[18px] font-semibold text-[var(--text)] hover:border-[var(--border-hover)] transition-colors cursor-pointer"
            >
              Thử nạp tệp PDF scan mẫu (OCR)
            </button>
          </div>
        ) : resourceViewMode === 'default' ? (
          <div className="flex flex-col gap-2">
            {sortedResources.map(renderResourceWrapper)}
          </div>
        ) : resourceViewMode === 'week' ? (
          <div className="flex flex-col gap-3">
            {weekGroups.map((group) => {
              const collapsed = Boolean(collapsedWeeks[group.key]);
              return (
                <div key={group.key} className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedWeeks((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
                    }
                    className="flex items-center justify-between px-2 py-1.5 rounded-[8px] bg-transparent hover:bg-[var(--surface-card-hover)] text-[13px] leading-[18px] font-semibold text-[var(--text)] transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {collapsed ? (
                        <IconChevronRight size={16} stroke={2} />
                      ) : (
                        <IconChevronDown size={16} stroke={2} />
                      )}
                      <span className="tabular-nums">{group.label}</span>
                    </span>
                    <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                      {group.items.length} nguồn
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="flex flex-col gap-2">
                      {group.items.map(renderResourceWrapper)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Đầu vào mode: 2 tabs Mail & PDF */
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-[8px] bg-[var(--surface-track)]">
              <button
                type="button"
                onClick={() => setResourceInputSubTab('mail')}
                className={`py-1.5 rounded-[6px] text-[13px] leading-[18px] font-semibold transition-colors tabular-nums cursor-pointer ${
                  resourceInputSubTab === 'mail'
                    ? 'bg-[var(--surface)] text-[var(--text)]'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Email ({mailResources.length})
              </button>
              <button
                type="button"
                onClick={() => setResourceInputSubTab('pdf')}
                className={`py-1.5 rounded-[6px] text-[13px] leading-[18px] font-semibold transition-colors tabular-nums cursor-pointer ${
                  resourceInputSubTab === 'pdf'
                    ? 'bg-[var(--surface)] text-[var(--text)]'
                    : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                PDF ({pdfResources.length})
              </button>
            </div>

            {resourceInputSubTab === 'mail' ? (
              mailResources.length === 0 ? (
                <p className="py-8 text-center text-[13px] leading-[20px] text-[var(--text-muted)]">
                  Chưa có email nào trong dự án. Nhấn Đồng bộ để kiểm tra hộp thư.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {mailResources.map(renderResourceWrapper)}
                </div>
              )
            ) : pdfResources.length === 0 ? (
              <p className="py-8 text-center text-[13px] leading-[20px] text-[var(--text-muted)]">
                Chưa có tệp PDF nào. Nhấn Tải lên để thêm tài liệu.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {pdfResources.map(renderResourceWrapper)}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
