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
  quote?: string;
}

const CITATION_REGEX = /`?\[(?:([^\]\n|]+?)\s*\|\s*)?tr\.\s*(\d+(?:\s*[–—-]\s*\d+)?(?:\s*[,;]\s*\d+(?:\s*[–—-]\s*\d+)?)*)\s*(?:\|\s*("(?:\\.|[^"\\\n])*"))?\s*\]`?/gi;

// encodeURIComponent leaves parentheses unescaped; source code often contains
// them, and an unmatched ')' would otherwise terminate a Markdown link early.
function citationComponent(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
}

function citationQuote(encoded?: string): string | undefined {
  if (!encoded) return undefined;
  try {
    const value: unknown = JSON.parse(encoded);
    return typeof value === 'string' && value.trim().length >= 8 && value.length <= 500
      ? value.trim() : undefined;
  } catch { return undefined; }
}

export function citationPages(spec: string): number[] {
  const pages = new Set<number>();
  for (const part of spec.split(/[,;]/)) {
    const match = part.trim().match(/^(\d+)(?:\s*[–—-]\s*(\d+))?$/);
    if (!match) return [];
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > 1000) return [];
    for (let page = start; page <= end; page++) pages.add(page);
  }
  return [...pages];
}

export function findPdfForCitation(
  project: Project,
  page: number,
  targetResourceId?: string,
  referencedSourceNames?: string[],
  sourceName?: string
): PdfResource | null {
  const pdfs = project.resources.flatMap((resource): PdfResource[] => {
    if (resource.type === 'pdf') return [resource];
    return resource.attachedPdfs || [];
  });
  const validPage = (pdf: PdfResource) => Boolean(pdf.fileUrl) &&
    Number.isInteger(page) && page >= 1 && page <= pdf.pageCount;

  let candidates: PdfResource[];
  if (targetResourceId) {
    const resource = project.resources.find((item) => item.id === targetResourceId);
    candidates = resource?.type === 'pdf' ? [resource] : resource?.attachedPdfs || pdfs.filter((pdf) => pdf.id === targetResourceId);
  } else {
    candidates = referencedSourceNames?.length
      ? pdfs.filter((pdf) => referencedSourceNames.includes(pdf.fileName))
      : project.resources.filter((item) => item.selected).flatMap((resource): PdfResource[] =>
          resource.type === 'pdf' ? [resource] : resource.attachedPdfs || []);
  }
  if (sourceName) candidates = candidates.filter((pdf) => pdf.fileName === sourceName.trim());
  // A bare page citation or duplicate filename cannot reliably select one of several PDFs.
  return candidates.length === 1 && validPage(candidates[0]) ? candidates[0] : null;
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
    const sourceName = match[1]?.trim();
    for (const page of citationPages(match[2])) {
      const rawLabel = sourceName ? `${sourceName} | tr. ${page}` : `tr. ${page}`;
      const pdf = findPdfForCitation(project, page, undefined, referencedSourceNames, sourceName);
      if (!pdf) continue;
      const quote = citationQuote(match[3]);
      const dedupeKey = `${pdf.id}:${page}:${quote || ""}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      results.push({ rawLabel, page, pdf, quote });
    }
  }

  return results;
}

/**
 * Render compact citation chips while preserving the source quote in the target.
 * Legacy page lists and ranges remain readable without guessing a passage.
 */
function preprocessCitations(markdown: string): string {
  return markdown.replace(CITATION_REGEX, (full, sourceName: string | undefined, spec: string, encodedQuote: string | undefined) => {
    const pages = citationPages(spec);
    if (!pages.length) return full;
    return pages.map((page) => {
      const label = sourceName ? `${sourceName.trim()} | tr. ${page}` : `tr. ${page}`;
      return `[${label}](#cite:${page}:${citationComponent(label)}:${citationComponent(sourceName?.trim() || '')}:${citationComponent(citationQuote(encodedQuote) || '')})`;
    }).join(' ');
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
              const [, pagePart, encodedLabel, encodedSource, encodedQuote] = href.split(':');
              const pageNum = Number(pagePart);
              let label: string, sourceName: string | undefined, quote: string | undefined;
              try {
                label = encodedLabel ? decodeURIComponent(encodedLabel) : `tr. ${pageNum}`;
                sourceName = encodedSource ? decodeURIComponent(encodedSource) : undefined;
                quote = encodedQuote ? decodeURIComponent(encodedQuote) : undefined;
              } catch { return <span>{children}</span>; }
              const targetPdf = findPdfForCitation(
                project,
                pageNum,
                targetResourceId,
                referencedSourceNames,
                sourceName
              );

              const rangeEnd = Number(label.match(/[–-]\s*(\d+)$/)?.[1] ?? pageNum);
              if (!targetPdf || rangeEnd < pageNum || rangeEnd > targetPdf.pageCount) return <span title="Trích dẫn chưa xác định được nguồn hoặc trang hợp lệ">{children}</span>;

              const isCurrentlyFocused =
                Boolean(targetPdf) &&
                pdfViewer?.resourceId === targetPdf?.id &&
                pdfViewer?.targetPage === pageNum &&
                pdfViewer?.citationQuote === quote;

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
                        citationQuote: quote,
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
