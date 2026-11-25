import { DEFAULT_CUSTOM_RECURRENCE } from '../data/seedData';
import type { MailResource, PdfPage, PdfResource, Project } from '../types/workspace';
import { stripReportCitations } from './reportCitations';

export const MAIL_OVERVIEW_REPORT_ID = '__mail-overview-report__';

export interface MailOverviewReport {
  recentMails: MailResource[];
  miniMarkdown: string;
  reportPdf: PdfResource;
}

/** Display the same bounded daily memory that the server includes in every chat. */
export function buildMailOverviewReport(project: Project): MailOverviewReport {
  const memory = project.dailyOverview;
  const dateParts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((item) => item.type === type)?.value || '';
  const day = memory?.date || `${part('year')}-${part('month')}-${part('day')}`;
  const recentMails = project.resources.filter((r): r is MailResource => r.type === 'mail' && Boolean(memory?.highlight_ids.includes(r.id)));
  const miniMarkdown = memory?.markdown || [
    '## Báo cáo tổng quan trong ngày',
    project.resources.some((r) => r.type === 'mail' && ['queued', 'processing'].includes(r.processingStatus || ''))
      ? 'Email đang được phân tích. Báo cáo sẽ cập nhật khi từng thư hoàn tất.'
      : 'Chưa có báo cáo email trong ngày. Đồng bộ email để cập nhật.',
  ].join('\n\n');
  const paragraphs = stripReportCitations(miniMarkdown).split(/\n\s*\n/).map((part) => part
    .replace(/^#{1,6}\s+/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim()).filter(Boolean);
  // The PDF and preview share the canonical server report; no extra detail dumps.
  // The existing PDF renderer expects pre-paginated text. Keep ample room for
  // Vietnamese glyphs and paragraph spacing so it never silently clips a report.
  const pages: PdfPage[] = [];
  let pageParagraphs: string[] = [];
  let chars = 0;
  const flush = () => {
    if (!pageParagraphs.length) return;
    pages.push({ pageNumber: pages.length + 1, headerTitle: `Báo cáo trong ngày · ${project.title}`,
      sections: [{ id: `daily-overview-${pages.length + 1}`, paragraphs: pageParagraphs }] });
    pageParagraphs = [];
    chars = 0;
  };
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    let chunk = '';
    for (const word of words) {
      if (chunk && chunk.length + word.length > 800) {
        if (chars + chunk.length > 1400 || pageParagraphs.length >= 8) flush();
        pageParagraphs.push(chunk);
        chars += chunk.length;
        chunk = '';
      }
      chunk += `${chunk ? ' ' : ''}${word}`;
    }
    if (chunk) {
      if (chars + chunk.length > 1400 || pageParagraphs.length >= 8) flush();
      pageParagraphs.push(chunk);
      chars += chunk.length;
    }
  }
  flush();
  const reportPdf: PdfResource = {
    id: `${MAIL_OVERVIEW_REPORT_ID}::${project.id}::${day}`,
    type: 'pdf', fileName: `Báo cáo tổng quan trong ngày ${day}.pdf`,
    fileSize: '', pageCount: pages.length, documentCode: `BC-MAIL-${project.id.toUpperCase()}`,
    issuedDate: day, createdAt: `${day}T00:00:00+07:00`, selected: false,
    summaryMarkdown: miniMarkdown, solutions: [], pages,
    schedule: { title: '', date: day, startTime: '', endTime: '', allDay: false,
      repeat: 'Does not repeat', customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
      hasDeadline: false, deadlineDate: '', description: '', isApproved: false },
  };
  return { recentMails, miniMarkdown, reportPdf };
}
