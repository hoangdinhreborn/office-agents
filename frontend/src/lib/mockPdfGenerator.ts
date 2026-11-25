import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import type { PdfPage, PdfResource } from '../types/workspace';

export interface PdfSectionRect {
  pageNumber: number;
  /** Percentage from top (0-100) */
  top: number;
  /** Percentage from left (0-100) */
  left: number;
  /** Percentage width (0-100) */
  width: number;
  /** Percentage height (0-100) */
  height: number;
}

export interface GeneratedPdfBundle {
  url: string;
  sectionRects: Record<string, PdfSectionRect>;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 48;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2;

let fontBytesPromise: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> | null = null;
const generatedPdfCache = new Map<string, Promise<GeneratedPdfBundle>>();

function loadUnicodeFonts() {
  fontBytesPromise ??= Promise.all([
    fetch('/assets/fonts/DejaVuSans.ttf').then((res) => {
      if (!res.ok) throw new Error('Không thể tải font DejaVuSans.ttf');
      return res.arrayBuffer();
    }),
    fetch('/assets/fonts/DejaVuSans-Bold.ttf').then((res) => {
      if (!res.ok) throw new Error('Không thể tải font DejaVuSans-Bold.ttf');
      return res.arrayBuffer();
    }),
  ]).then(([regular, bold]) => ({ regular, bold }));
  return fontBytesPromise;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
        current = word;
      } else {
        // Hard-break very long tokens (URLs/codes)
        let chunk = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, fontSize) > maxWidth) {
            if (chunk) lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildContinuationPage(pdf: PdfResource, pageNumber: number): PdfPage {
  const docLabel = pdf.documentCode ? `${pdf.documentCode} · ` : '';
  return {
    pageNumber,
    headerTitle: `${docLabel}${pdf.fileName.replace(/\.pdf$/i, '').toUpperCase()}`,
    sections: [
      {
        id: `auto-cont-${pdf.id}-p${pageNumber}`,
        heading: `Mục phụ lục kỹ thuật & đối chiếu — Trang ${pageNumber}`,
        paragraphs: [
          `Nội dung tiếp nối của tài liệu "${pdf.fileName}" (${pdf.pageCount} trang). Các điều khoản triển khai chi tiết, tiêu chuẩn nghiệm thu kỹ thuật và bảng phân định trách nhiệm giữa các bên được duy trì thống nhất với phần mục lục chính của hồ sơ.`,
          'Mọi yêu cầu điều chỉnh phạm vi, lịch biểu hoặc đầu mối phối hợp phải được xác nhận bằng văn bản hoặc biên bản cuộc họp trước mốc rà soát định kỳ để bảo đảm tiến độ dự án.',
        ],
      },
    ],
  };
}

/**
 * Generates a real multi-page Vietnamese PDF binary Blob URL for mock PDF resources
 * using pdf-lib + @pdf-lib/fontkit so @extend/pdf-viewer (EmbedPDF / PDFium) renders
 * crisp vector Vietnamese text, supports search & text selection, and provides exact
 * percentage bounding boxes for citation focusing.
 */
export function getOrBuildPdfBundle(pdf: PdfResource): Promise<GeneratedPdfBundle> {
  if (pdf.fileUrl) {
    return Promise.resolve({ url: pdf.fileUrl, sectionRects: {} });
  }

  const cacheKey = `${pdf.id}:${pdf.pageCount}:${pdf.pages?.length ?? 0}`;
  const cached = generatedPdfCache.get(cacheKey);
  if (cached) return cached;

  const task = (async (): Promise<GeneratedPdfBundle> => {
    const [{ regular, bold }] = await Promise.all([loadUnicodeFonts()]);
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    pdfDoc.setTitle(pdf.fileName);
    pdfDoc.setAuthor('Sổ Việc — Trợ lý Văn phòng Cục bộ');

    const regularFont = await pdfDoc.embedFont(regular, { subset: true });
    const boldFont = await pdfDoc.embedFont(bold, { subset: true });

    const pageMap = new Map<number, PdfPage>();
    let highestMockPage = 1;
    for (const pg of pdf.pages ?? []) {
      pageMap.set(pg.pageNumber, pg);
      if (pg.pageNumber > highestMockPage) highestMockPage = pg.pageNumber;
    }

    const totalPages = Math.max(1, Math.min(36, Math.max(pdf.pageCount, highestMockPage)));
    const sectionRects: Record<string, PdfSectionRect> = {};

    const inkPrimary = rgb(0.08, 0.13, 0.24); // #14213D
    const inkBody = rgb(0.15, 0.2, 0.28);
    const inkMuted = rgb(0.42, 0.48, 0.58);
    const ruleColor = rgb(0.84, 0.87, 0.92);
    const headerBg = rgb(0.94, 0.96, 0.98);

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      const data = pageMap.get(pageNumber) ?? buildContinuationPage(pdf, pageNumber);

      // Running header
      const headerY = A4_HEIGHT - 44;
      const headerLines = wrapText(data.headerTitle, boldFont, 8.5, CONTENT_WIDTH - 74);
      page.drawText(headerLines[0] ?? pdf.fileName, {
        x: MARGIN_X,
        y: headerY,
        size: 8.5,
        font: boldFont,
        color: inkMuted,
      });

      const pageBadge = `Trang ${pageNumber}/${totalPages}`;
      const badgeWidth = boldFont.widthOfTextAtSize(pageBadge, 8.5);
      page.drawText(pageBadge, {
        x: A4_WIDTH - MARGIN_X - badgeWidth,
        y: headerY,
        size: 8.5,
        font: boldFont,
        color: inkPrimary,
      });

      page.drawLine({
        start: { x: MARGIN_X, y: headerY - 10 },
        end: { x: A4_WIDTH - MARGIN_X, y: headerY - 10 },
        thickness: 0.75,
        color: ruleColor,
      });

      // Body sections
      let cursorY = headerY - 34;

      for (const section of data.sections) {
        const sectionTopY = cursorY + 14;

        if (section.heading) {
          const headingLines = wrapText(section.heading, boldFont, 11.5, CONTENT_WIDTH);
          for (const hLine of headingLines) {
            if (cursorY < 86) break;
            page.drawText(hLine, {
              x: MARGIN_X,
              y: cursorY,
              size: 11.5,
              font: boldFont,
              color: inkPrimary,
            });
            cursorY -= 17;
          }
          cursorY -= 4;
        }

        for (const para of section.paragraphs) {
          const lines = wrapText(para, regularFont, 10, CONTENT_WIDTH);
          for (const line of lines) {
            if (cursorY < 86) break;
            page.drawText(line, {
              x: MARGIN_X,
              y: cursorY,
              size: 10,
              font: regularFont,
              color: inkBody,
            });
            cursorY -= 15.5;
          }
          cursorY -= 7;
        }

        // Structured table rendering
        if (section.table && cursorY > 140) {
          const { headers, rows } = section.table;
          const colCount = Math.max(1, headers.length);
          const colWidths =
            colCount === 4
              ? [CONTENT_WIDTH * 0.1, CONTENT_WIDTH * 0.44, CONTENT_WIDTH * 0.18, CONTENT_WIDTH * 0.28]
              : colCount === 3
                ? [CONTENT_WIDTH * 0.48, CONTENT_WIDTH * 0.22, CONTENT_WIDTH * 0.3]
                : Array.from({ length: colCount }, () => CONTENT_WIDTH / colCount);

          cursorY -= 4;
          const rowHeight = 22;
          // Table header bar
          page.drawRectangle({
            x: MARGIN_X,
            y: cursorY - rowHeight + 6,
            width: CONTENT_WIDTH,
            height: rowHeight,
            color: headerBg,
            borderColor: ruleColor,
            borderWidth: 0.6,
          });

          let colX = MARGIN_X;
          headers.forEach((h, idx) => {
            const w = colWidths[idx] ?? CONTENT_WIDTH / colCount;
            const clipped = wrapText(h, boldFont, 8.5, w - 10)[0] ?? h;
            page.drawText(clipped, {
              x: colX + 6,
              y: cursorY - 9,
              size: 8.5,
              font: boldFont,
              color: inkPrimary,
            });
            colX += w;
          });
          cursorY -= rowHeight;

          for (const row of rows) {
            if (cursorY < 92) break;
            page.drawRectangle({
              x: MARGIN_X,
              y: cursorY - rowHeight + 6,
              width: CONTENT_WIDTH,
              height: rowHeight,
              borderColor: ruleColor,
              borderWidth: 0.5,
            });

            let cellX = MARGIN_X;
            row.forEach((cell, idx) => {
              const w = colWidths[idx] ?? CONTENT_WIDTH / colCount;
              const clipped = wrapText(cell, regularFont, 8.5, w - 10)[0] ?? cell;
              page.drawText(clipped, {
                x: cellX + 6,
                y: cursorY - 9,
                size: 8.5,
                font: regularFont,
                color: inkBody,
              });
              cellX += w;
            });
            cursorY -= rowHeight;
          }
          cursorY -= 12;
        }

        const sectionBottomY = Math.max(72, cursorY + 4);
        const topPct = Math.max(0, Math.min(95, ((A4_HEIGHT - sectionTopY - 6) / A4_HEIGHT) * 100));
        const bottomPct = Math.max(
          topPct + 4,
          Math.min(96, ((A4_HEIGHT - sectionBottomY + 6) / A4_HEIGHT) * 100)
        );

        sectionRects[section.id] = {
          pageNumber,
          top: topPct,
          left: ((MARGIN_X - 14) / A4_WIDTH) * 100,
          width: ((CONTENT_WIDTH + 28) / A4_WIDTH) * 100,
          height: bottomPct - topPct,
        };

        cursorY -= 14;
      }

      // Running footer
      const footerY = 36;
      page.drawLine({
        start: { x: MARGIN_X, y: footerY + 14 },
        end: { x: A4_WIDTH - MARGIN_X, y: footerY + 14 },
        thickness: 0.6,
        color: ruleColor,
      });

      const footerLeft = pdf.isOcr
        ? 'Văn bản trích xuất qua OCR cục bộ — Sổ Việc'
        : 'Tài liệu dự án nội bộ — Sổ Việc';
      page.drawText(footerLeft, {
        x: MARGIN_X,
        y: footerY,
        size: 8,
        font: regularFont,
        color: inkMuted,
      });

      const footerRight = `${pdf.documentCode ?? 'DOC-LOCAL'} · Trang ${pageNumber} / ${totalPages}`;
      const footerRightW = regularFont.widthOfTextAtSize(footerRight, 8);
      page.drawText(footerRight, {
        x: A4_WIDTH - MARGIN_X - footerRightW,
        y: footerY,
        size: 8,
        font: regularFont,
        color: inkMuted,
      });
    }

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    return { url, sectionRects };
  })();

  generatedPdfCache.set(cacheKey, task);
  return task;
}
