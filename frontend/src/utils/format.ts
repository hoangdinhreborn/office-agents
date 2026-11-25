import { z } from 'zod';
import type { CustomRecurrence, ProjectIconCode, RepeatOption } from '../types/workspace';

export function truncate10(value: string): string {
  const chars = Array.from(value);
  return chars.length > 10 ? `${chars.slice(0, 10).join('')}…` : value;
}

/** Display first 18 characters per the resource layout specification. */
export function truncate18(value: string): string {
  if (!value) return '';
  if (value.length <= 18) return value;
  return `${value.slice(0, 18)}...`;
}

export function truncate30(value: string): string {
  if (!value) return '';
  if (value.length <= 30) return value;
  return `${value.slice(0, 30)}...`;
}

/**
 * Exact format from layout-spec.yaml: dd-mm-yyyy
 */
export function formatDateDDMMYYYY(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '24-11-2026';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export function getWeekGroupKey(isoDate: string): { key: string; label: string; sortValue: number } {
  const d = new Date(isoDate);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const key = monday.toISOString().slice(0, 10);
  const startLabel = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`;
  const endLabel = `${String(sunday.getDate()).padStart(2, '0')}/${String(sunday.getMonth() + 1).padStart(2, '0')}/${sunday.getFullYear()}`;
  return {
    key,
    label: `Tuần ${startLabel} – ${endLabel}`,
    sortValue: monday.getTime(),
  };
}

export function formatBytesVi(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function formatRepeatSummary(repeat: RepeatOption, custom: CustomRecurrence): string {
  if (repeat !== 'Custom...') return repeat;
  const dayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const days =
    custom.unit === 'tuần' && custom.weekdays.length > 0
      ? ` (${custom.weekdays.map((idx) => dayLabels[idx]).join(', ')})`
      : '';
  let endText = '';
  if (custom.endType === 'on_date' && custom.endDate) {
    endText = `, đến ${formatDateDDMMYYYY(custom.endDate)}`;
  } else if (custom.endType === 'after_count') {
    endText = `, sau ${custom.endCount} lần`;
  }
  return `Lặp mỗi ${custom.interval} ${custom.unit}${days}${endText}`;
}

export const projectTitleSchema = z
  .string()
  .trim()
  .min(2, 'Tên dự án cần tối thiểu 2 ký tự.')
  .max(80, 'Tên dự án tối đa 80 ký tự.');

export const memberEmailSchema = z
  .string()
  .trim()
  .email('Địa chỉ email không đúng định dạng.');

export const scheduleSchema = z
  .object({
    title: z.string().trim().min(2, 'Vui lòng nhập tiêu đề lịch làm việc.'),
    date: z.string().min(1, 'Vui lòng chọn ngày diễn ra.'),
    startTime: z.string(),
    endTime: z.string(),
    allDay: z.boolean(),
  })
  .refine(
    (val) => {
      if (val.allDay) return true;
      return Boolean(val.startTime && val.endTime && val.endTime > val.startTime);
    },
    {
      message: 'Giờ kết thúc phải lớn hơn giờ bắt đầu.',
      path: ['endTime'],
    }
  );

export const customRepeatSchema = z.object({
  interval: z.number().int().min(1, 'Chu kỳ lặp nhỏ nhất là 1.'),
  unit: z.enum(['ngày', 'tuần', 'tháng', 'năm']),
  weekdays: z.array(z.number().min(0).max(6)),
  endType: z.enum(['never', 'on_date', 'after_count']),
  endDate: z.string(),
  endCount: z.number().int().min(1, 'Số lần lặp nhỏ nhất là 1.'),
});

export const PROJECT_ICON_OPTIONS: { code: ProjectIconCode; label: string }[] = [
  { code: 'briefcase', label: 'Công việc' },
  { code: 'file-text', label: 'Tài liệu' },
  { code: 'scale', label: 'Pháp lý' },
  { code: 'building', label: 'Doanh nghiệp' },
  { code: 'users', label: 'Nhân sự' },
  { code: 'calendar-event', label: 'Lịch họp' },
  { code: 'chart-bar', label: 'Báo cáo' },
  { code: 'folder', label: 'Hồ sơ' },
  { code: 'mail', label: 'Thư tín' },
  { code: 'receipt', label: 'Hóa đơn' },
  { code: 'clipboard-list', label: 'Kế hoạch' },
  { code: 'target', label: 'Mục tiêu' },
  { code: 'database', label: 'Dữ liệu' },
  { code: 'bulb', label: 'Ý tưởng' },
  { code: 'shield-check', label: 'Kiểm định' },
  { code: 'rocket', label: 'Triển khai' },
  { code: 'book', label: 'Quy trình' },
  { code: 'calculator', label: 'Tài chính' },
  { code: 'presentation', label: 'Trình bày' },
  { code: 'world', label: 'Đối ngoại' },
];
