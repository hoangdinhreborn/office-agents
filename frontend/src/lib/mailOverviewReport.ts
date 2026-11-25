import { DEFAULT_CUSTOM_RECURRENCE } from '../data/seedData';
import type { MailResource, PdfPage, PdfResource, PdfSection, Project } from '../types/workspace';
import { formatDateDDMMYYYY } from '../utils/format';

export const MAIL_OVERVIEW_REPORT_ID = '__mail-overview-report__';

function stripMarkdownToPlain(input: string): string {
  return input
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function summarizeOneLine(mail: MailResource): string {
  const raw =
    mail.summaryByStyle['ngắn'] ||
    mail.summaryByStyle['ý chính'] ||
    mail.summaryByStyle['gạch đầu dòng'] ||
    '';
  const cleaned = stripMarkdownToPlain(raw).replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 155) return cleaned;
  return `${cleaned.slice(0, 152).trimEnd()}...`;
}

export interface MailOverviewReport {
  recentMails: MailResource[];
  miniMarkdown: string;
  reportPdf: PdfResource;
}

export function buildMailOverviewReport(project: Project): MailOverviewReport {
  const recentMails = project.resources
    .filter((r): r is MailResource => r.type === 'mail')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const pdfCount = project.resources.filter((r) => r.type === 'pdf').length;
  const mailSignature =
    recentMails.length > 0
      ? recentMails.map((m) => `${m.id}_${m.createdAt}`).join('|')
      : `empty_${project.resources.length}`;

  const latestDateStr =
    recentMails[0] ? formatDateDDMMYYYY(recentMails[0].createdAt) : formatDateDDMMYYYY(project.createdAt);

  // Build concise mini-markdown overview for the empty-chat view
  const miniMarkdown =
    recentMails.length > 0
      ? [
          `#### Báo cáo tổng quan ${recentMails.length} mail gần nhất`,
          ...recentMails.map((mail, index) => {
            const roleLabel = mail.senderRole === 'nội bộ' ? 'Nội bộ' : 'Khách';
            const line = summarizeOneLine(mail);
            const scheduleHint = mail.schedule?.title
              ? ` — *Lịch đề xuất:* ${mail.schedule.title} (${formatDateDDMMYYYY(mail.schedule.date)})`
              : '';
            return `${index + 1}. **${mail.subject}** · \`${mail.senderEmail}\` (${roleLabel}, ${formatDateDDMMYYYY(mail.createdAt)})\n   ${line}${scheduleHint}`;
          }),
        ].join('\n\n')
      : [
          `#### Báo cáo tổng quan email — ${project.title}`,
          `Dự án hiện chưa có email nào được đồng bộ (đang có **${pdfCount} tài liệu PDF**). Hãy nhấn **Đồng bộ email** trong khung Tài nguyên để cập nhật báo cáo 3 mail gần nhất.`,
        ].join('\n\n');

  // Build structured multi-page executive PDF document from the markdown report
  const pages: PdfPage[] = [];

  if (recentMails.length > 0) {
    const internalCount = recentMails.filter((m) => m.senderRole === 'nội bộ').length;
    const guestCount = recentMails.length - internalCount;

    const overviewSection: PdfSection = {
      id: 'mail-report-overview',
      heading: 'I. Tổng quan điều hành',
      paragraphs: [
        `Báo cáo tổng hợp nhanh ${recentMails.length} email mới nhất thuộc dự án "${project.title}" (cập nhật đến ngày ${latestDateStr}), phục vụ rà soát tiến độ và phê duyệt phương án xử lý theo yêu cầu quản lý.`,
        `Phân loại nguồn gửi: ${internalCount} email nội bộ và ${guestCount} email đối tác/khách hàng. Hiện dự án đang theo dõi ${project.members.length} đầu mối email và lưu trữ ${pdfCount} tài liệu PDF tham chiếu.`,
      ],
      table: {
        headers: ['STT', 'Người gửi', 'Phân loại', 'Tiêu đề & Ngày nhận'],
        rows: recentMails.map((mail, idx) => [
          `0${idx + 1}`,
          mail.senderEmail,
          mail.senderRole === 'nội bộ' ? 'Nội bộ' : 'Khách',
          `${mail.subject} (${formatDateDDMMYYYY(mail.createdAt)})`,
        ]),
      },
    };

    const highlightsSection: PdfSection = {
      id: 'mail-report-highlights',
      heading: 'II. Tóm tắt trọng tâm từng email',
      paragraphs: recentMails.map((mail, idx) => {
        const shortText = stripMarkdownToPlain(
          mail.summaryByStyle['ngắn'] || mail.summaryByStyle['ý chính']
        ).replace(/\s+/g, ' ');
        const statusText = mail.schedule?.isApproved
          ? `Đã chốt lịch: ${mail.schedule.title} (${formatDateDDMMYYYY(mail.schedule.date)}).`
          : mail.schedule?.title
            ? `Đề xuất lịch: ${mail.schedule.title} (${formatDateDDMMYYYY(mail.schedule.date)}).`
            : 'Chưa phát sinh lịch hẹn mới.';
        return `${idx + 1}. ${mail.subject} — ${shortText} ${statusText}`;
      }),
    };

    pages.push({
      pageNumber: 1,
      headerTitle: `Báo cáo Tổng quan Email · ${project.title}`,
      sections: [overviewSection, highlightsSection],
    });

    const detailSections: PdfSection[] = recentMails.map((mail, idx) => {
      const keyPoints = stripMarkdownToPlain(
        mail.summaryByStyle['ý chính'] || mail.summaryByStyle['gạch đầu dòng']
      )
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const primarySolution = mail.solutions[0];
      const solutionSummary = primarySolution
        ? `Phương án khuyến nghị: ${stripMarkdownToPlain(primarySolution.titleMarkdown)} — ${stripMarkdownToPlain(primarySolution.prosConsMarkdown).replace(/\s+/g, ' ')}`
        : 'Chưa có phương án đề xuất bổ sung.';

      const scheduleLine = mail.schedule
        ? `Kế hoạch hành động: ${mail.schedule.title} vào ngày ${formatDateDDMMYYYY(mail.schedule.date)} (${mail.schedule.allDay ? 'Cả ngày' : `${mail.schedule.startTime} - ${mail.schedule.endTime}`}) — Trạng thái: ${mail.schedule.isApproved ? 'Đã phê duyệt' : 'Chờ phê duyệt'}.`
        : 'Chưa có lịch hành động.';

      return {
        id: `mail-report-detail-${idx + 1}`,
        heading: `${idx + 1}. ${mail.subject}`,
        paragraphs: [
          `Người gửi: ${mail.senderEmail} (${mail.senderRole === 'nội bộ' ? 'Nội bộ' : 'Khách'}) · Ngày nhận: ${formatDateDDMMYYYY(mail.createdAt)} · Thư mục: ${mail.folderName}${mail.hasPdfAttachment ? ' · Có tệp PDF đính kèm' : ''}.`,
          ...keyPoints.slice(0, 3),
          solutionSummary,
          scheduleLine,
        ],
      };
    });

    pages.push({
      pageNumber: 2,
      headerTitle: `Chi tiết Phân tích & Đề xuất Hành động · ${project.title}`,
      sections: detailSections,
    });
  } else {
    pages.push({
      pageNumber: 1,
      headerTitle: `Báo cáo Tổng quan Email · ${project.title}`,
      sections: [
        {
          id: 'mail-report-empty',
          heading: 'I. Trạng thái đồng bộ email',
          paragraphs: [
            `Dự án "${project.title}" hiện chưa ghi nhận email đồng bộ nào tính đến ngày ${latestDateStr}.`,
            `Hiện dự án đang lưu trữ ${pdfCount} tài liệu PDF và theo dõi ${project.members.length} đầu mối email thành viên.`,
            'Đề xuất: Mở khung Tài nguyên và chọn Đồng bộ email để tự động cập nhật tối đa 3 email gần nhất vào báo cáo tổng quan này.',
          ],
        },
      ],
    });
  }

  const reportPdf: PdfResource = {
    id: `${MAIL_OVERVIEW_REPORT_ID}::${project.id}::${mailSignature}`,
    type: 'pdf',
    fileName:
      recentMails.length > 0
        ? `Báo cáo tổng quan ${recentMails.length} mail gần nhất.pdf`
        : 'Báo cáo tổng quan email dự án.pdf',
    fileSize: pages.length > 1 ? '540 KB' : '290 KB',
    pageCount: pages.length,
    documentCode: `BC-MAIL-${project.id.toUpperCase()}`,
    issuedDate: latestDateStr,
    createdAt: recentMails[0]?.createdAt ?? project.createdAt,
    selected: false,
    summaryByStyle: {
      ngắn: miniMarkdown,
      'ý chính': miniMarkdown,
      'gạch đầu dòng': miniMarkdown,
    },
    activeSummaryStyle: 'ngắn',
    solutions: [],
    schedule: {
      title: 'Rà soát báo cáo tổng quan email',
      date: latestDateStr,
      startTime: '09:00',
      endTime: '09:30',
      allDay: false,
      repeat: 'Does not repeat',
      customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
      hasDeadline: false,
      deadlineDate: '',
      description: '',
      isApproved: false,
    },
    pages,
  };

  return {
    recentMails,
    miniMarkdown,
    reportPdf,
  };
}
