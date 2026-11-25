import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBookmarkFilled,
  IconFileTypePdf,
  IconLoader2,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PDFViewer,
  type PDFViewerHandle,
  type CitationFocusResult,
  type PDFViewerPageOverlayProps,
  type PDFViewerTheme,
} from '@/src/components/extend/pdf-viewer';
import {
  getOrBuildPdfBundle,
  type GeneratedPdfBundle,
} from '@/src/lib/mockPdfGenerator';
import { MAIL_OVERVIEW_REPORT_ID } from '../lib/mailOverviewReport';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { PdfResource, PdfViewerState, ThemeMode } from '../types/workspace';

interface PdfViewerPanelProps {
  pdf: PdfResource;
  viewerState: PdfViewerState;
  isWide?: boolean;
  onToggleWide?: () => void;
}

function resolveAppTheme(mode: ThemeMode): PDFViewerTheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export function PdfViewerPanel({
  pdf,
  viewerState,
  isWide = false,
  onToggleWide,
}: PdfViewerPanelProps) {
  const closePdfViewer = useWorkspaceStore((s) => s.closePdfViewer);
  const themeMode = useWorkspaceStore((s) => s.themeMode);

  const viewerRef = useRef<PDFViewerHandle | null>(null);
  const [viewerTheme, setViewerTheme] = useState<PDFViewerTheme>(() =>
    resolveAppTheme(themeMode)
  );
  const [bundle, setBundle] = useState<GeneratedPdfBundle | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [loadedNumPages, setLoadedNumPages] = useState<number>(0);
  const [citationStatus, setCitationStatus] = useState<CitationFocusResult | 'searching' | null>(null);
  const isGeneratedReport = pdf.id === MAIL_OVERVIEW_REPORT_ID || pdf.id.startsWith(`${MAIL_OVERVIEW_REPORT_ID}::`);
  const reportContentKey = isGeneratedReport ? JSON.stringify(pdf.pages) : '';

  // Sync PDF viewer theme automatically when global app theme mode changes
  useEffect(() => {
    setViewerTheme(resolveAppTheme(themeMode));
    if (themeMode !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setViewerTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [themeMode]);

  // Build or fetch real binary PDF URL (with embedded Unicode Vietnamese fonts & section bounding boxes)
  useEffect(() => {
    let cancelled = false;
    setBundleError(null);
    setBundle(null);
    setLoadedNumPages(0);

    const source = pdf.fileUrl
      ? Promise.resolve({ url: pdf.fileUrl, sectionRects: {} })
      : isGeneratedReport
        ? getOrBuildPdfBundle(pdf)
        : Promise.reject(new Error("Tài nguyên này chưa có PDF gốc. Vui lòng tải lại file qua Tài nguyên."));

    source
      .then((result) => {
        if (!cancelled) {
          setBundle(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBundleError(
            err instanceof Error ? err.message : 'Không thể khởi tạo tệp PDF xem trước.'
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pdf.id, pdf.fileUrl, reportContentKey]);

  const activeSectionRect = useMemo(() => {
    if (pdf.fileUrl || !bundle || !viewerState.highlightSectionId) return null;
    return bundle.sectionRects[viewerState.highlightSectionId] ?? null;
  }, [bundle, pdf.fileUrl, viewerState.highlightSectionId]);

  const scrollToCitationTarget = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const handle = viewerRef.current;
      if (!handle || loadedNumPages < 1) return;

      if (activeSectionRect) {
        const clampedPage = Math.max(1, Math.min(loadedNumPages, activeSectionRect.pageNumber));
        handle.scrollToPageArea(
          clampedPage,
          {
            top: activeSectionRect.top,
            left: activeSectionRect.left,
            width: activeSectionRect.width,
            height: activeSectionRect.height,
          },
          { behavior }
        );
        return;
      }

      const clampedPage = Math.max(1, Math.min(loadedNumPages, viewerState.targetPage || 1));
      handle.scrollToPage(clampedPage, { behavior });
    },
    [activeSectionRect, loadedNumPages, viewerState.targetPage]
  );

  // Scroll whenever document loads or a new citation is clicked
  useEffect(() => {
    if (loadedNumPages < 1) return;
    const timer = window.setTimeout(() => {
      scrollToCitationTarget('smooth');
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    loadedNumPages,
    viewerState.resourceId,
    viewerState.targetPage,
    viewerState.highlightSectionId,
    viewerState.focusNonce,
    scrollToCitationTarget,
  ]);

  useEffect(() => {
    const handle = viewerRef.current;
    handle?.clearCitation();
    setCitationStatus(null);
    if (!pdf.fileUrl || !viewerState.citationQuote || loadedNumPages < 1) return;
    let cancelled = false;
    setCitationStatus('searching');
    // Wait for the loaded document to propagate to the viewer handle. Run after
    // the page-only scroll above, so it cannot overwrite the passage position.
    const start = window.setTimeout(() => {
      const current = viewerRef.current;
      if (!current) { window.clearTimeout(deadline); setCitationStatus('error'); return; }
      current.focusCitation(viewerState.targetPage, viewerState.citationQuote!).then((status) => {
        if (!cancelled) {
          window.clearTimeout(deadline);
          setCitationStatus(status);
        }
      });
    }, 180);
    const deadline = window.setTimeout(() => {
      cancelled = true;
      viewerRef.current?.clearCitation();
      setCitationStatus('error');
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      window.clearTimeout(deadline);
      handle?.clearCitation();
      viewerRef.current?.clearCitation();
    };
  }, [pdf.fileUrl, loadedNumPages, viewerState.targetPage, viewerState.citationQuote, viewerState.focusNonce]);

  const renderPageOverlay = useCallback(
    ({ pageNumber }: PDFViewerPageOverlayProps) => {
      if (!activeSectionRect || activeSectionRect.pageNumber !== pageNumber) {
        return null;
      }
      const isDark = viewerTheme === 'dark';
      return (
        <div
          key={`${viewerState.highlightSectionId}-${viewerState.focusNonce}`}
          className={`pointer-events-none absolute z-20 rounded-[8px] transition-colors ${
            isDark ? 'bg-[#6F86B0]/20' : 'bg-[#14213D]/10'
          }`}
          style={{
            top: `${activeSectionRect.top}%`,
            left: `${activeSectionRect.left}%`,
            width: `${activeSectionRect.width}%`,
            height: `${activeSectionRect.height}%`,
          }}
        >
          <span
            className={`absolute top-1.5 right-2 inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] leading-[16px] font-semibold whitespace-nowrap ${
              isDark
                ? 'bg-[#1B2C4E] text-[#E8ECF4]'
                : 'bg-[#E8ECF4] text-[#14213D]'
            }`}
          >
            <IconBookmarkFilled size={11} />
            <span>Trích dẫn</span>
          </span>
        </div>
      );
    },
    [activeSectionRect, viewerState.highlightSectionId, viewerState.focusNonce, viewerState.citationLabel, viewerState.targetPage, viewerTheme, pdf.fileUrl]
  );

  return (
    <aside
      aria-label={`Chế độ xem PDF: ${pdf.fileName}`}
      className="w-full h-full bg-[var(--surface-panel)] flex flex-col overflow-hidden"
    >
      {/* Compact Document Header */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-[8px] bg-transparent text-[#E34D45] flex items-center justify-center shrink-0">
            <IconFileTypePdf size={20} stroke={1.75} />
          </span>
          <div className="min-w-0 flex flex-col">
            <span
              title={pdf.fileName}
              className="text-[14px] leading-[20px] font-bold text-[var(--text)] truncate"
            >
              {pdf.fileName}
            </span>
            <span className="text-[12px] leading-[16px] text-[var(--text-muted)] tabular-nums truncate">
              {pdf.documentCode ? `${pdf.documentCode} · ` : ''}
              {loadedNumPages || pdf.pageCount} trang · {pdf.fileSize}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {bundle && <a href={bundle.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[var(--accent-ink)] px-2">Mở PDF gốc</a>}
          {onToggleWide && (
            <button
              type="button"
              title={isWide ? 'Thu gọn khung xem PDF' : 'Mở rộng khung xem PDF'}
              aria-label={isWide ? 'Thu gọn khung xem PDF' : 'Mở rộng khung xem PDF'}
              onClick={onToggleWide}
              className="w-8 h-8 rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] flex items-center justify-center transition-colors cursor-pointer"
            >
              {isWide ? (
                <IconArrowsMinimize size={17} stroke={1.75} />
              ) : (
                <IconArrowsMaximize size={17} stroke={1.75} />
              )}
            </button>
          )}
          <button
            type="button"
            title={
              viewerState.resourceId === MAIL_OVERVIEW_REPORT_ID
                ? 'Đóng báo cáo tổng quan PDF'
                : 'Đóng chế độ xem PDF và quay lại Tài nguyên'
            }
            aria-label="Đóng chế độ xem PDF"
            onClick={closePdfViewer}
            className="w-8 h-8 rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <IconX size={18} stroke={1.75} />
          </button>
        </div>
      </div>

      <div className="h-px w-full bg-[var(--divider)] shrink-0" />

      {pdf.fileUrl && viewerState.citationLabel && (
        <div role="status" aria-live="polite" className="shrink-0 px-4 py-2 text-[12px] text-[var(--text-muted)] border-b border-[var(--divider)]">
          {!viewerState.citationQuote
            ? 'Trích dẫn cũ chỉ lưu số trang, chưa có đoạn nguyên văn để định vị. Tạo lại câu trả lời để có trích dẫn chính xác.'
            : citationStatus === 'searching' || !citationStatus
              ? 'Đang tìm đoạn trích trong PDF…'
              : citationStatus === 'matched'
                ? 'Đã tô các dòng chứa đoạn trích nguyên văn.'
                : citationStatus === 'ambiguous'
                  ? 'Đoạn trích lặp lại nhiều lần trên trang; chưa thể xác định duy nhất vị trí.'
                  : citationStatus === 'error'
                    ? 'Chưa định vị được đoạn trích. Bạn có thể tìm trong PDF hoặc mở bản gốc.'
                    : 'Không tìm thấy đoạn nguyên văn trên trang này. PDF scan chưa có lớp chữ cũng chưa định vị được.'}
        </div>
      )}

      {/* @extend/pdf-viewer instance with native Light/Dark theme switch */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {bundleError ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-6 text-center bg-[var(--bg)]">
            <p className="text-[14px] font-semibold text-[var(--destroy-fg)]">{bundleError}</p>
          </div>
        ) : !bundle ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2.5 p-6 text-center bg-[var(--bg)]">
            <IconLoader2 size={24} className="animate-spin text-[var(--text-muted)]" />
            <p className="text-[13px] text-[var(--text-muted)]">Đang tải PDF gốc và bộ đọc...</p>
          </div>
        ) : (
          <PDFViewer
            ref={viewerRef}
            src={bundle.url}
            fileName={pdf.fileName}
            defaultZoom="fit-width"
            theme={viewerTheme}
            onThemeChange={setViewerTheme}
            showThemeToggle
            showDownload
            showRotateControls
            showUpload={false}
            onDocumentLoadSuccess={(numPages) => setLoadedNumPages(numPages)}
            renderPageOverlay={renderPageOverlay}
          />
        )}
      </div>
    </aside>
  );
}
