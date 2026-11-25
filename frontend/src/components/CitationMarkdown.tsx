import { IconBookmarkFilled } from '@tabler/icons-react';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { PdfResource, Project } from '../types/workspace';

interface CitationMarkdownProps {
  content: string;
  project: Project;
  targetResourceId?: string;
  referencedSourceNames?: string[];
  compact?: boolean;
}

export interface ExtractedCitation {
  rawLabel: string;
  page: number;
  pdf: PdfResource;
}

const CITATION_REGEX = /`?\[tr\.\s*(\d+)(?:\s*[–-]\s*(\d+))?\]`?/gi;

export function findPdfForCitation(
  project: Project,
  page: number,
  targetResourceId?: string,
  referencedSourceNames?: string[]
): PdfResource | null {
  const pdfs = project.resources.filter((r): r is PdfResource => r.type === 'pdf');
  if (pdfs.length === 0) return null;

  if (targetResourceId) {
    const exact = pdfs.find((p) => p.id === targetResourceId);
    if (exact) return exact;
  }

  if (referencedSourceNames && referencedSourceNames.length > 0) {
    const refMatch = pdfs.find(
      (p) =>
        referencedSourceNames.includes(p.fileName) &&
        (p.pages?.some((pg) => pg.pageNumber === page) || page <= p.pageCount)
    );
    if (refMatch) return refMatch;

    const firstRefPdf = pdfs.find((p) => referencedSourceNames.includes(p.fileName));
    if (firstRefPdf) return firstRefPdf;
  }

  const pageMatch = pdfs.find((p) => p.pages?.some((pg) => pg.pageNumber === page));
  if (pageMatch) return pageMatch;

  const selectedPdf = pdfs.find((p) => p.selected);
  return selectedPdf ?? pdfs[0];
}

export function extractCitationEntries(
  content: string,
  project: Project,
  referencedSourceNames?: string[]
): ExtractedCitation[] {
  const seen = new Set<string>();
  const results: ExtractedCitation[] = [];
  const regex = new RegExp(CITATION_REGEX.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const startPage = Number(match[1]);
    const endPage = match[2] ? Number(match[2]) : null;
    const rawLabel = endPage ? `tr. ${startPage}–${endPage}` : `tr. ${startPage}`;
    const pdf = findPdfForCitation(project, startPage, undefined, referencedSourceNames);
    if (!pdf) continue;

    const dedupeKey = `${pdf.id}:${rawLabel}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push({ rawLabel, page: startPage, pdf });
  }

  return results;
}

/**
 * Replaces `[tr. 14]` or `` `[tr. 14]` `` with custom markdown links `#cite-<page>-<label>`
 * so ReactMarkdown renders them inline as clickable filled citation buttons.
 */
function preprocessCitations(markdown: string): string {
  return markdown.replace(CITATION_REGEX, (_full, startStr: string, endStr?: string) => {
    const label = endStr ? `tr. ${startStr}–${endStr}` : `tr. ${startStr}`;
    const encodedLabel = encodeURIComponent(label);
    return `[${label}](#cite:${startStr}:${encodedLabel})`;
  });
}

export function CitationMarkdown({
  content,
  project,
  targetResourceId,
  referencedSourceNames,
  compact = false,
}: CitationMarkdownProps) {
  const openPdfViewer = useWorkspaceStore((s) => s.openPdfViewer);
  const pdfViewer = useWorkspaceStore((s) => s.pdfViewer);

  const processedContent = useMemo(() => preprocessCitations(content), [content]);

  return (
    <div className={`markdown-content ${compact ? 'markdown-compact' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => {
            if (href && href.startsWith('#cite:')) {
              const [, pagePart, encodedLabel] = href.split(':');
              const pageNum = Number(pagePart) || 1;
              const label = encodedLabel ? decodeURIComponent(encodedLabel) : `tr. ${pageNum}`;
              const targetPdf = findPdfForCitation(
                project,
                pageNum,
                targetResourceId,
                referencedSourceNames
              );

              const isCurrentlyFocused =
                Boolean(targetPdf) &&
                pdfViewer?.resourceId === targetPdf?.id &&
                pdfViewer?.targetPage === pageNum;

              return (
                <button
                  type="button"
                  title={
                    targetPdf
                      ? `Mở ${targetPdf.fileName} tại ${label}`
                      : `Xem trích dẫn ${label}`
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (targetPdf) {
                      openPdfViewer(project.id, targetPdf.id, {
                        page: pageNum,
                        citationLabel: label,
                      });
                    }
                  }}
                  className={`inline-flex items-center gap-1 align-baseline mx-0.5 px-2 py-0.5 rounded-[6px] text-[12px] leading-[16px] font-semibold tabular-nums transition-colors cursor-pointer ${
                    isCurrentlyFocused
                      ? 'bg-[var(--surface-control)] text-[var(--accent-ink)] hover:bg-[#FCA311] hover:text-[#14213D]'
                      : 'bg-[var(--surface-control)] text-[var(--text)] hover:bg-[#FCA311] hover:text-[#14213D]'
                  }`}
                >
                  <IconBookmarkFilled
                    size={12}
                    className={`shrink-0 ${isCurrentlyFocused ? 'text-current' : 'opacity-80'}`}
                  />
                  <span>{children}</span>
                </button>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent-ink)] hover:underline"
                {...rest}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
