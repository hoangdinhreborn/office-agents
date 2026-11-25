import {
  IconCheck,
  IconFileTypePdf,
  IconLoader2,
  IconMailForward,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type {
  ResourceItem,
  SolutionOption,
  ToolbarTab,
} from '../types/workspace';
import { truncate10 } from '../utils/format';
import { Button } from './ui/button';
import { CitationMarkdown } from './CitationMarkdown';
import { CalendarDraftForm } from './CalendarDraftForm';
import { ReplyMailDialog } from './ReplyMailDialog';

interface ResourceToolbarProps {
  projectId: string;
  resource: ResourceItem;
  activeTab: ToolbarTab;
  onSelectTab: (tab: ToolbarTab) => void;
}

export function ResourceToolbar({
  projectId,
  resource,
  activeTab,
  onSelectTab,
}: ResourceToolbarProps) {
  const projects = useWorkspaceStore((s) => s.projects);
  const regeneratingSolutionsResourceId = useWorkspaceStore(
    (s) => s.regeneratingSolutionsResourceId
  );
  const updateMailUrgency = useWorkspaceStore((s) => s.updateMailUrgency);
  const openPdfViewer = useWorkspaceStore((s) => s.openPdfViewer);
  const retryEmailAnalysis = useWorkspaceStore((s) => s.retryEmailAnalysis);
  const regenerateSolutions = useWorkspaceStore((s) => s.regenerateSolutions);

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  const [updatingUrgency, setUpdatingUrgency] = useState(false);
  const [retryingAnalysis, setRetryingAnalysis] = useState(false);
  const [constraintInput, setConstraintInput] = useState('');
  const [replySolutionTarget, setReplySolutionTarget] = useState<{
    solution: SolutionOption;
    index: number;
  } | null>(null);
  const isRegeneratingSolutions = regeneratingSolutionsResourceId === resource.id;
  const unavailable = resource.type === 'mail' && resource.processingStatus !== 'processed';
  const processing = resource.type === 'mail' && (resource.processingStatus === 'queued' || resource.processingStatus === 'processing');

  async function submitConstraints() {
    const submitted = constraintInput;
    if (await regenerateSolutions(projectId, resource.id, submitted)) {
      setConstraintInput((current) => current === submitted ? '' : current);
    }
  }

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
          const isActive = (processing ? 'summarize' : activeTab) === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              disabled={unavailable && tab.id !== 'summarize'}
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
        {(activeTab === 'summarize' || processing) && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[12px] text-[var(--text-muted)]">Tóm tắt 4 phần</span>
              {resource.type === 'pdf' && (resource.isOcr || resource.isMapReduce) && (
                <span className="text-[12px] leading-[16px] text-[var(--text-muted)]">
                  {[resource.isOcr ? 'OCR cục bộ' : '', resource.isMapReduce ? 'Map-Reduce' : ''].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>

            {resource.type === 'mail' && Boolean(resource.attachedPdfs?.length) && (
              <div className="flex flex-wrap gap-2" aria-label="PDF đính kèm email">
                {resource.attachedPdfs?.map((pdf) => (
                  <Button key={pdf.id} variant="outline" size="sm" disabled={!pdf.fileUrl}
                    title={pdf.fileName} aria-label={`Mở PDF ${pdf.fileName}`}
                    onClick={() => openPdfViewer(projectId, pdf.id)}>
                    <IconFileTypePdf className="text-[var(--destroy-500)]" size={20} stroke={1.75} />
                    {truncate10(pdf.fileName)}
                  </Button>
                ))}
              </div>
            )}

            {resource.type === 'mail' && <label className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
              Mức ưu tiên
              <select value={resource.urgency} disabled={updatingUrgency || processing} onChange={async (event) => {
                const value = event.target.value;
                if (value !== 'Khẩn cấp' && value !== 'Cao' && value !== 'Trung bình' && value !== 'Thấp') return;
                setUpdatingUrgency(true);
                try { await updateMailUrgency(projectId, resource.id, value); }
                finally { setUpdatingUrgency(false); }
              }} className="bg-[var(--surface)] rounded p-1 text-[var(--text)]">
                {['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>}
            {processing && <div role="status" className="flex flex-col gap-2">
              <p className="text-[12px] text-[var(--text-muted)]">{resource.type === 'mail' ? resource.processingStage : ''} · Kết quả sẽ tự hiện khi hoàn tất.</p>
              {[100, 90, 70].map((width) => <div key={width} aria-hidden="true" className="h-3 rounded bg-[var(--surface-control)] animate-pulse motion-reduce:animate-none" style={{ width: `${width}%` }} />)}
            </div>}
            {resource.type === 'mail' && resource.processingError && <div className="text-[12px] space-y-2">
              <p className="text-[var(--destroy-fg)]">{resource.processingError}</p>
              <button type="button" disabled={retryingAnalysis} className="text-[var(--accent-ink)] font-semibold disabled:opacity-50 cursor-pointer"
                onClick={async () => {
                  setRetryingAnalysis(true);
                  try { await retryEmailAnalysis(projectId, resource.id); }
                  finally { setRetryingAnalysis(false); }
                }}>{retryingAnalysis ? 'Đang phân tích lại...' : 'Phân tích lại nội dung đã lưu'}</button>
            </div>}
            {resource.type === 'pdf' && resource.processingWarning && <p className="text-[12px] text-[var(--text-muted)]">{resource.processingWarning}</p>}
            {project ? (
              <CitationMarkdown
                content={resource.summaryMarkdown}
                project={project}
                targetResourceId={resource.id}
                compact
              />
            ) : (
              <div className="markdown-content markdown-compact">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {resource.summaryMarkdown}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: solution-tab (2-column grid + shared global footer) */}
        {!unavailable && activeTab === 'solution' && (
          <div className="flex flex-col gap-3">
            {Boolean(resource.constraintHistory?.length) && <details className="text-[12px] text-[var(--text-muted)]">
              <summary className="cursor-pointer">Ràng buộc đã áp dụng ({resource.constraintHistory?.length})</summary>
              <ol className="list-decimal pl-5 mt-2 flex flex-col gap-1">
                {resource.constraintHistory?.map((item, index) => <li key={index}>{item}</li>)}
              </ol>
            </details>}
            {!resource.solutions.length && !isRegeneratingSolutions && <p className="text-[13px] text-[var(--text-muted)]">Chưa có phương án. Nhập ràng buộc nếu cần rồi bấm Đề xuất lại.</p>}
            {isRegeneratingSolutions && <div role="status" className="flex flex-col gap-2">
              <span className="text-[12px] text-[var(--text-muted)]">Đang đọc nguồn và tinh chỉnh phương án…</span>
              {[100, 85, 65].map((width) => <div key={width} className="h-3 rounded bg-[var(--surface-control)] animate-pulse motion-reduce:animate-none" style={{ width: `${width}%` }} />)}
            </div>}
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
                      {project ? <CitationMarkdown content={sol.titleMarkdown} project={project} targetResourceId={resource.id} compact /> : (
                        <div className="markdown-content markdown-compact"><ReactMarkdown remarkPlugins={[remarkGfm]}>{sol.titleMarkdown}</ReactMarkdown></div>
                      )}
                      <div className="h-px w-full bg-[var(--divider)]" />
                      {project ? <CitationMarkdown content={sol.prosConsMarkdown} project={project} targetResourceId={resource.id} compact /> : (
                        <div className="markdown-content markdown-compact"><ReactMarkdown remarkPlugins={[remarkGfm]}>{sol.prosConsMarkdown}</ReactMarkdown></div>
                      )}
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
                maxLength={2000}
                disabled={Boolean(regeneratingSolutionsResourceId)}
                value={constraintInput}
                onChange={(e) => setConstraintInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isRegeneratingSolutions) {
                    void submitConstraints();
                  }
                }}
                placeholder="Thêm ràng buộc"
                aria-label="Thêm ràng buộc để đề xuất lại toàn bộ giải pháp"
                className="flex-1 min-w-0 h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] leading-[18px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
              />
              <button
                type="button"
                disabled={Boolean(regeneratingSolutionsResourceId)}
                onClick={() => { void submitConstraints(); }}
                className="h-9 px-3.5 rounded-[8px] bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)] text-[13px] leading-[18px] font-semibold hover:bg-[var(--primary-btn-hover)] disabled:opacity-60 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isRegeneratingSolutions && <IconLoader2 size={14} className="animate-spin" />}
                <span>Đề xuất lại</span>
              </button>
            </div>
          </div>
        )}

        {!processing && activeTab === 'schedule' && <CalendarDraftForm key={`${projectId}:${resource.id}`} projectId={projectId} resourceId={resource.id} initialDrafts={resource.scheduleDrafts} />}

      </div>

      {replySolutionTarget && project && (
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
