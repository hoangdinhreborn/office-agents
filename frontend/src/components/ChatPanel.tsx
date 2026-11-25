import {
  IconArrowNarrowUp,
  IconBookmarkFilled,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconCopyCheckFilled,
  IconFileTypePdf,
  IconLoader2,
  IconQuote,
  IconQuoteFilled,
  IconSettings2,
  IconThumbDown,
  IconThumbDownFilled,
  IconThumbUp,
  IconThumbUpFilled,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { resolvePdfCitationTarget } from '../data/mockPdfDocuments';
import { CURRENT_USER, LOCAL_MODELS } from '../data/seedData';
import { buildMailOverviewReport, MAIL_OVERVIEW_REPORT_ID } from '../lib/mailOverviewReport';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { ModelItem, Project } from '../types/workspace';
import {
  CitationMarkdown,
  extractCitationEntries,
  type ExtractedCitation,
} from './CitationMarkdown';
import { ModelSettingsDialog } from './ModelSettingsDialog';

const MAX_COMPOSER_HEIGHT = 184;

interface ChatPanelProps {
  project: Project;
  onMeasureMinWidth?: (minWidth: number) => void;
}

export function ChatPanel({ project, onMeasureMinWidth }: ChatPanelProps) {
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const chatSessions = useWorkspaceStore((s) => s.chatSessions);
  const selectedModelId = useWorkspaceStore((s) => s.selectedModelId);
  const modelProviders = useWorkspaceStore((s) => s.modelProviders);
  const isAgentResponding = useWorkspaceStore((s) => s.isAgentResponding);

  const setSelectedModelId = useWorkspaceStore((s) => s.setSelectedModelId);
  const sendChatMessage = useWorkspaceStore((s) => s.sendChatMessage);
  const setMessageFeedback = useWorkspaceStore((s) => s.setMessageFeedback);
  const openPdfViewer = useWorkspaceStore((s) => s.openPdfViewer);
  const openMailOverviewReportPdf = useWorkspaceStore((s) => s.openMailOverviewReportPdf);
  const pdfViewer = useWorkspaceStore((s) => s.pdfViewer);

  // Controlled text with explicit Undo/Redo stack (Ctrl+Z / Ctrl+Shift+Z per layout-spec.yaml)
  const [inputValue, setInputValue] = useState('');
  const [undoStack, setUndoStack] = useState<string[]>(['']);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const [citationsDialog, setCitationsDialog] = useState<{
    messageId: string;
    entries: ExtractedCitation[];
  } | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);

  const activeSession = useMemo(
    () => chatSessions.find((s) => s.id === activeSessionId && s.projectId === project.id) ?? null,
    [chatSessions, activeSessionId, project.id]
  );

  const allAvailableModels = useMemo(() => {
    const list = modelProviders.flatMap((p) => p.models);
    return list.length > 0 ? list : LOCAL_MODELS;
  }, [modelProviders]);

  const activeModel = useMemo(
    () => allAvailableModels.find((m) => m.id === selectedModelId) ?? allAvailableModels[0],
    [allAvailableModels, selectedModelId]
  );

  const modelsByProvider = useMemo(() => {
    const map = new Map<string, ModelItem[]>();
    for (const m of allAvailableModels) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return Array.from(map.entries());
  }, [allAvailableModels]);

  const mailOverviewReport = useMemo(() => buildMailOverviewReport(project), [project]);

  const isMailReportOpen = Boolean(
    pdfViewer &&
      pdfViewer.projectId === project.id &&
      pdfViewer.resourceId === MAIL_OVERVIEW_REPORT_ID
  );

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setModelPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, isAgentResponding]);

  // Auto-grow composer textarea upward toward top without visible scrollbars up to MAX_COMPOSER_HEIGHT
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT);
    el.style.height = `${nextHeight}px`;
  }, [inputValue]);

  // Measure left tab minimum width as the sum of non-wrapping composer controls + readable input width
  useLayoutEffect(() => {
    if (!onMeasureMinWidth) return;
    const measure = () => {
      const modelW = modelButtonRef.current?.offsetWidth ?? 168;
      const sendW = sendButtonRef.current?.offsetWidth ?? 36;
      // 48px section horizontal padding (px-6) + 28px composer inner padding + 20px gaps + 180px min input area
      const computedMin = modelW + sendW + 276;
      onMeasureMinWidth(Math.ceil(Math.max(420, computedMin)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [onMeasureMinWidth, activeModel.name]);

  useEffect(() => {
    if (!citationsDialog) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCitationsDialog(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [citationsDialog]);

  const updateInputWithHistory = (nextVal: string) => {
    setInputValue(nextVal);
    setUndoStack((prev) => {
      const truncated = prev.slice(0, historyIndex + 1);
      if (truncated[truncated.length - 1] === nextVal) return truncated;
      const nextStack = [...truncated.slice(-49), nextVal];
      setHistoryIndex(nextStack.length - 1);
      return nextStack;
    });
  };

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isAgentResponding) return;
    setInputValue('');
    setUndoStack(['']);
    setHistoryIndex(0);
    sendChatMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Alt + Enter -> newline
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${inputValue.slice(0, start)}\n${inputValue.slice(end)}`;
      updateInputWithHistory(next);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 1;
          textareaRef.current.selectionEnd = start + 1;
        }
      });
      return;
    }

    // Enter (without Alt / Shift) -> send message
    if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Ctrl + Shift + Z -> redo text
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (historyIndex < undoStack.length - 1) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setInputValue(undoStack[nextIdx]);
      }
      return;
    }

    // Ctrl + Z -> undo text
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (historyIndex > 0) {
        const prevIdx = historyIndex - 1;
        setHistoryIndex(prevIdx);
        setInputValue(undoStack[prevIdx]);
      }
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 1500);
  };

  const hasMessages = Boolean(activeSession && activeSession.messages.length > 0);

  return (
    <section
      aria-label="Khu vực hội thoại"
      className="flex-1 min-w-0 h-full bg-[var(--bg)] flex flex-col overflow-hidden px-6 py-4"
    >
      {/* Top / middle viewport: either centered greeting OR messages-component */}
      {!hasMessages ? (
        <div className="flex-1 min-h-0 scroll-area flex flex-col items-center px-4 py-4">
          <div className="my-auto w-full max-w-[640px] flex flex-col items-center text-center">
            <h2 className="text-[25px] leading-[32px] font-bold tracking-[-0.01em] text-[var(--text)] max-w-[540px] text-balance">
              Chào {CURRENT_USER.name}, hôm nay nhiều việc lắm đấy
            </h2>

            {/* Mini markdown overview report for up to 3 most recent emails */}
            <div className="mt-5 w-full rounded-[12px] bg-[var(--surface-card)] border border-[var(--border)]/60 text-left overflow-hidden flex flex-col">
              <div className="px-4 py-3.5 max-h-[248px] scroll-area">
                <div className="markdown-content markdown-compact max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {mailOverviewReport.miniMarkdown}
                  </ReactMarkdown>
                </div>
              </div>

              <div className="h-px w-full bg-[var(--divider)] shrink-0" />

              <div className="px-4 py-2.5 bg-[var(--surface-recessed)]/50 flex items-center justify-between gap-3">
                <span className="text-[12px] leading-[16px] text-[var(--text-muted)] tabular-nums truncate">
                  {mailOverviewReport.recentMails.length > 0
                    ? `Bản tóm tắt tự động · ${mailOverviewReport.recentMails.length} mail mới nhất`
                    : 'Bản tóm tắt email dự án'}
                </span>
                <button
                  type="button"
                  onClick={() => openMailOverviewReportPdf(project.id)}
                  className={`h-8 px-3 rounded-[8px] text-[13px] leading-[18px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    isMailReportOpen
                      ? 'bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)] hover:bg-[var(--primary-btn-hover)]'
                      : 'bg-[var(--surface-control)] text-[var(--text)] hover:bg-[#FCA311] hover:text-[#14213D]'
                  }`}
                >
                  <IconFileTypePdf size={15} stroke={1.75} />
                  <span>Xem chi tiết</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 scroll-area pr-2">
          <div className="max-w-[760px] w-full mx-auto flex flex-col gap-6 pb-4">
            {activeSession?.messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex flex-col items-end gap-1.5">
                    <div className="max-w-[80%] rounded-[12px] bg-[var(--surface-card)] text-[var(--text)] px-4 py-3 text-[16px] leading-[24px] whitespace-pre-wrap">
                      {msg.content}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Sao chép tin nhắn"
                        title="Sao chép"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="h-8 px-2 rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors inline-flex items-center gap-1 text-[12px] cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <IconCopyCheckFilled size={15} className="text-[var(--success-fg)]" />
                            <span className="text-[var(--success-fg)] font-semibold">Đã chép</span>
                          </>
                        ) : (
                          <IconCopy size={15} stroke={1.75} />
                        )}
                      </button>
                    </div>
                  </div>
                );
              }

              const reasoningOpen = Boolean(expandedReasoning[msg.id]);
              const citationEntries = extractCitationEntries(
                msg.content,
                project,
                msg.referencedSourceNames
              );
              const isCitationsDialogOpenForMsg = citationsDialog?.messageId === msg.id;

              return (
                <div key={msg.id} className="flex flex-col items-start gap-2 max-w-[92%]">
                  {/* Agent response header: ghost reasoning block */}
                  {msg.reasoning && (
                    <div className="w-full max-w-[660px] flex flex-col items-start gap-1">
                      {/* reasoning-component-shadcn (ghost style) */}
                      <div className="w-full rounded-[10px] bg-transparent">
                        <button
                          type="button"
                          aria-expanded={reasoningOpen}
                          onClick={() =>
                            setExpandedReasoning((prev) => ({
                              ...prev,
                              [msg.id]: !prev[msg.id],
                            }))
                          }
                          className="inline-flex items-center gap-2 px-2 py-1.5 -ml-2 rounded-[8px] bg-transparent hover:bg-[var(--surface-card-hover)] text-left text-[13px] leading-[18px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-1.5 tabular-nums">
                            {reasoningOpen ? (
                              <IconChevronDown size={15} stroke={2} />
                            ) : (
                              <IconChevronRight size={15} stroke={2} />
                            )}
                            <span>
                              Quá trình suy luận · {msg.reasoningDurationSec ?? 1.2} giây
                            </span>
                          </span>
                          <span className="text-[12px] font-normal opacity-80">
                            {reasoningOpen ? 'Thu gọn' : 'Xem chi tiết'}
                          </span>
                        </button>
                        {reasoningOpen && (
                          <div className="mt-1.5 ml-1 pl-3 border-l border-[var(--border)] text-[13px] leading-[20px] text-[var(--text-body)] whitespace-pre-line font-mono">
                            {msg.reasoning}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* markdown-view with clickable low-saturation primary inline citations (accent on hover) */}
                  <div className="w-full text-justify">
                    <CitationMarkdown
                      content={msg.content}
                      project={project}
                      referencedSourceNames={msg.referencedSourceNames}
                    />
                  </div>

                  {/* Agent actions row: copy icon + RL feedback controls + citations quote button */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Sao chép phản hồi"
                      title="Sao chép"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="h-8 px-2 rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors inline-flex items-center gap-1 text-[12px] cursor-pointer"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <IconCopyCheckFilled size={15} className="text-[var(--success-fg)]" />
                          <span className="text-[var(--success-fg)] font-semibold">Đã chép</span>
                        </>
                      ) : (
                        <IconCopy size={15} stroke={1.75} />
                      )}
                    </button>

                    {activeSession && project.config.collectRlFeedback && (
                      <>
                        <button
                          type="button"
                          aria-label="Đánh giá hữu ích"
                          title="Hữu ích (ghi nhận tín hiệu RL)"
                          onClick={() => setMessageFeedback(activeSession.id, msg.id, 'up')}
                          className={`w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors cursor-pointer ${
                            msg.feedback === 'up'
                              ? 'bg-[var(--success-bg)] text-[var(--success-fg)]'
                              : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
                          }`}
                        >
                          {msg.feedback === 'up' ? (
                            <IconThumbUpFilled size={15} />
                          ) : (
                            <IconThumbUp size={15} stroke={1.75} />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label="Đánh giá cần cải thiện"
                          title="Cần cải thiện (ghi nhận tín hiệu RL)"
                          onClick={() => setMessageFeedback(activeSession.id, msg.id, 'down')}
                          className={`w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors cursor-pointer ${
                            msg.feedback === 'down'
                              ? 'bg-[var(--destroy-bg)] text-[var(--destroy-fg)]'
                              : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
                          }`}
                        >
                          {msg.feedback === 'down' ? (
                            <IconThumbDownFilled size={15} />
                          ) : (
                            <IconThumbDown size={15} stroke={1.75} />
                          )}
                        </button>
                      </>
                    )}

                    {citationEntries.length > 0 && (
                      <button
                        type="button"
                        aria-label={`Mở danh sách ${citationEntries.length} trích dẫn nguồn`}
                        title={`Trích dẫn nguồn (${citationEntries.length})`}
                        onClick={() =>
                          setCitationsDialog({
                            messageId: msg.id,
                            entries: citationEntries,
                          })
                        }
                        className={`h-8 px-2 rounded-[8px] bg-transparent hover:bg-[var(--surface-card-hover)] text-[12px] leading-[16px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          isCitationsDialogOpenForMsg
                            ? 'text-[var(--accent-ink)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        {isCitationsDialogOpenForMsg ? (
                          <IconQuoteFilled size={15} className="shrink-0" />
                        ) : (
                          <IconQuote size={15} stroke={1.75} className="shrink-0" />
                        )}
                        <span className="tabular-nums">
                          {citationEntries.length} trích dẫn nguồn
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {isAgentResponding && (
              <div className="flex items-center gap-2.5 text-[14px] leading-[20px] text-[var(--text-muted)] py-2">
                <IconLoader2 size={18} stroke={2} className="animate-spin text-[var(--accent-ink)]" />
                <span>Đang phân tích ngữ cảnh trên {activeModel.name}...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* chat-component: w.center h.bottom (grows upward as lines wrap, no visible scrollbar) */}
      <div className="shrink-0 pt-3 max-w-[760px] w-full mx-auto">
        <div className="rounded-[16px] bg-[var(--surface-card)] elevated-subtle px-3.5 py-2.5 flex items-end gap-2.5">
          {/* input-field: full width, auto-grow upward without scrollbar */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputValue}
            onChange={(e) => updateInputWithHistory(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Hỏi về PDF, email đã chọn hoặc yêu cầu lập lịch..."
            aria-label="Nhập tin nhắn"
            className="flex-1 min-w-0 max-h-[184px] overflow-y-auto no-scrollbar py-2 px-1 bg-transparent border-0 text-[16px] leading-[24px] text-[var(--text)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none"
          />

          {/* Model selector button (outline) + Popover */}
          <div className="relative shrink-0" ref={popoverRef}>
            <button
              ref={modelButtonRef}
              type="button"
              aria-expanded={modelPopoverOpen}
              onClick={() => setModelPopoverOpen((v) => !v)}
              className="h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] leading-[18px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] transition-colors whitespace-nowrap cursor-pointer"
            >
              {activeModel.name}
            </button>

            {modelPopoverOpen && (
              <div
                role="dialog"
                aria-label="Chọn mô hình cục bộ"
                className="absolute right-0 bottom-12 w-[300px] rounded-[12px] bg-[var(--surface)] elevated-container z-30 flex flex-col max-h-[340px]"
              >
                {/* popover header: left "Mô hình", right settings-2 icon */}
                <div className="flex items-center justify-between px-4 py-3 shrink-0">
                  <span className="text-[14px] leading-[20px] font-bold text-[var(--text)]">
                    Mô hình
                  </span>
                  <button
                    type="button"
                    aria-label="Cài đặt mô hình cục bộ"
                    title="Cài đặt Local LLM & Adapter RL"
                    onClick={() => {
                      setModelPopoverOpen(false);
                      setModelSettingsOpen(true);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
                  >
                    <IconSettings2 size={18} stroke={1.75} />
                  </button>
                </div>

                <div className="h-px w-full bg-[var(--divider)] shrink-0" />

                {/* popover content: scroll enable, stacked by provider */}
                <div className="scroll-area p-2.5 flex flex-col gap-3">
                  {modelsByProvider.map(([provider, models]) => (
                    <div key={provider} className="flex flex-col gap-1">
                      <span className="px-2 pt-1 pb-0.5 text-[15px] leading-[22px] font-bold text-[var(--text)] tracking-[-0.005em]">
                        {provider}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        {models.map((m) => {
                          const isSelected = m.id === selectedModelId;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSelectedModelId(m.id);
                                setModelPopoverOpen(false);
                              }}
                              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-[8px] text-left transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-[var(--surface-control)] text-[var(--text)]'
                                  : 'bg-transparent text-[var(--text-body)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
                              }`}
                            >
                              <div className="min-w-0 flex flex-col">
                                <span className="text-[13px] leading-[18px] font-semibold truncate">
                                  {m.name}
                                </span>
                                <span className="text-[12px] leading-[16px] text-[var(--text-muted)] tabular-nums">
                                  {m.quantization} · {m.contextWindow}
                                </span>
                              </div>
                              {isSelected && (
                                <IconCheck
                                  size={16}
                                  stroke={2}
                                  className="shrink-0 text-[var(--accent-ink)]"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Send icon button: arrow-narrow-up (filled) */}
          <button
            ref={sendButtonRef}
            type="button"
            aria-label="Gửi tin nhắn"
            title="Gửi tin nhắn (Enter)"
            disabled={!inputValue.trim() || isAgentResponding}
            onClick={handleSend}
            className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
              inputValue.trim() && !isAgentResponding
                ? 'bg-[#FCA311] text-[#14213D] hover:bg-[var(--accent-hover)]'
                : 'bg-[var(--surface-recessed)] text-[var(--text-muted)]/60 cursor-not-allowed'
            }`}
          >
            <IconArrowNarrowUp size={20} stroke={2} />
          </button>
        </div>
      </div>

      {/* Provider & Local LLM Settings Dialog (triggered by settings-2) */}
      <ModelSettingsDialog
        open={modelSettingsOpen}
        onClose={() => setModelSettingsOpen(false)}
      />

      {/* Source Citations Dialog triggered by Quote icon */}
      {citationsDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4"
          onClick={() => setCitationsDialog(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="citations-dialog-title"
        >
          <div
            className="w-full max-w-[540px] rounded-[16px] bg-[var(--surface)] elevated-container flex flex-col max-h-[82vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <IconQuoteFilled size={20} className="text-[var(--accent-ink)] shrink-0" />
                <h3
                  id="citations-dialog-title"
                  className="text-[18px] leading-[24px] font-semibold text-[var(--text)]"
                >
                  Trích dẫn nguồn ({citationsDialog.entries.length})
                </h3>
              </div>
              <button
                type="button"
                aria-label="Đóng hộp thoại trích dẫn"
                onClick={() => setCitationsDialog(null)}
                className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <IconX size={20} stroke={1.75} />
              </button>
            </div>

            <div className="h-px w-full bg-[var(--divider)] shrink-0" />

            <div className="p-5 scroll-area flex flex-col gap-2.5">
              {citationsDialog.entries.map((entry) => {
                const resolved = resolvePdfCitationTarget(entry.pdf, entry.page);
                const pageObj = entry.pdf.pages?.find(
                  (p) => p.pageNumber === resolved.pageNumber
                );
                const secObj =
                  pageObj?.sections.find((s) => s.id === resolved.sectionId) ??
                  pageObj?.sections[0];
                const isFocused =
                  pdfViewer?.resourceId === entry.pdf.id &&
                  pdfViewer?.targetPage === resolved.pageNumber;

                return (
                  <button
                    key={`${entry.pdf.id}-${entry.rawLabel}`}
                    type="button"
                    onClick={() => {
                      openPdfViewer(project.id, entry.pdf.id, {
                        page: entry.page,
                        sectionId: resolved.sectionId,
                        citationLabel: entry.rawLabel,
                      });
                      setCitationsDialog(null);
                    }}
                    className="group w-full text-left rounded-[12px] bg-[var(--surface-recessed)] hover:bg-[var(--surface-card-hover)] p-3.5 flex flex-col gap-2 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <IconFileTypePdf
                          size={17}
                          stroke={1.75}
                          className="text-[#E34D45] shrink-0"
                        />
                        <span className="text-[13px] leading-[18px] font-semibold text-[var(--text)] truncate">
                          {entry.pdf.fileName}
                        </span>
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] leading-[16px] font-semibold tabular-nums shrink-0 transition-colors ${
                          isFocused
                            ? 'bg-[var(--surface-control)] text-[var(--accent-ink)] group-hover:bg-[#FCA311] group-hover:text-[#14213D]'
                            : 'bg-[var(--surface-control)] text-[var(--text)] group-hover:bg-[#FCA311] group-hover:text-[#14213D]'
                        }`}
                      >
                        <IconBookmarkFilled size={11} />
                        <span>{entry.rawLabel}</span>
                      </span>
                    </div>

                    {secObj && (
                      <div className="flex flex-col gap-1">
                        {secObj.heading && (
                          <span className="text-[12px] leading-[18px] font-semibold text-[var(--text)]">
                            {secObj.heading}
                          </span>
                        )}
                        {secObj.paragraphs[0] && (
                          <p className="text-[12px] leading-[18px] text-[var(--text-muted)] line-clamp-2">
                            {secObj.paragraphs[0]}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
