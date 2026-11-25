import { IconMinus, IconPlus, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { CustomRecurrence, RepeatEndType, RepeatUnit } from '../types/workspace';
import { customRepeatSchema } from '../utils/format';

interface CustomRepeatDialogProps {
  open: boolean;
  initialValue: CustomRecurrence;
  onSave: (value: CustomRecurrence) => void;
  onClose: () => void;
}

const WEEKDAY_BUTTONS = [
  { index: 0, short: 'S', label: 'Chủ nhật' },
  { index: 1, short: 'M', label: 'Thứ Hai' },
  { index: 2, short: 'T', label: 'Thứ Ba' },
  { index: 3, short: 'W', label: 'Thứ Tư' },
  { index: 4, short: 'T', label: 'Thứ Năm' },
  { index: 5, short: 'F', label: 'Thứ Sáu' },
  { index: 6, short: 'S', label: 'Thứ Bảy' },
];

export function CustomRepeatDialog({
  open,
  initialValue,
  onSave,
  onClose,
}: CustomRepeatDialogProps) {
  const [draft, setDraft] = useState<CustomRecurrence>(initialValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(initialValue);
      setError(null);
    }
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggleWeekday = (idx: number) => {
    setDraft((prev) => {
      const exists = prev.weekdays.includes(idx);
      const nextDays = exists
        ? prev.weekdays.filter((d) => d !== idx)
        : [...prev.weekdays, idx].sort((a, b) => a - b);
      return { ...prev, weekdays: nextDays };
    });
  };

  const handleConfirm = () => {
    const parsed = customRepeatSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Giá trị tùy chỉnh không hợp lệ.');
      return;
    }
    if (draft.endType === 'on_date' && !draft.endDate) {
      setError('Vui lòng chọn ngày kết thúc lặp.');
      return;
    }
    onSave(parsed.data);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-repeat-title"
    >
      <div
        className="w-full max-w-[440px] rounded-[16px] bg-[var(--surface)] elevated-container flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: horizontal left "Tùy chỉnh lặp" */}
        <div className="flex items-center justify-between px-6 py-4">
          <h3
            id="custom-repeat-title"
            className="text-[20px] leading-[24px] font-semibold text-[var(--text)]"
          >
            Tùy chỉnh lặp
          </h3>
          <button
            type="button"
            aria-label="Đóng tùy chỉnh lặp"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <IconX size={20} stroke={1.75} />
          </button>
        </div>

        <div className="h-px w-full bg-[var(--divider)]" />

        {/* Content: stacked */}
        <div className="p-6 flex flex-col gap-5">
          {/* Lặp mỗi [number-spinner min=1] [select-box: ngày/tuần/tháng/năm] */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)]">
              Lặp mỗi
            </span>

            <div className="inline-flex items-center rounded-[8px] bg-transparent border border-[var(--border)] h-10 overflow-hidden">
              <button
                type="button"
                aria-label="Giảm chu kỳ lặp"
                disabled={draft.interval <= 1}
                onClick={() =>
                  setDraft((prev) => ({ ...prev, interval: Math.max(1, prev.interval - 1) }))
                }
                className="w-9 h-full flex items-center justify-center bg-transparent text-[var(--text)] hover:bg-[var(--surface-card-hover)] disabled:opacity-40 cursor-pointer"
              >
                <IconMinus size={15} stroke={2} />
              </button>
              <input
                type="number"
                min={1}
                aria-label="Số chu kỳ lặp"
                value={draft.interval}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setDraft((prev) => ({ ...prev, interval: Number.isNaN(n) ? 1 : Math.max(1, n) }));
                }}
                className="w-12 h-full text-center bg-transparent text-[14px] font-semibold text-[var(--text)] tabular-nums focus:outline-none"
              />
              <button
                type="button"
                aria-label="Tăng chu kỳ lặp"
                onClick={() => setDraft((prev) => ({ ...prev, interval: prev.interval + 1 }))}
                className="w-9 h-full flex items-center justify-center bg-transparent text-[var(--text)] hover:bg-[var(--surface-card-hover)] cursor-pointer"
              >
                <IconPlus size={15} stroke={2} />
              </button>
            </div>

            <select
              aria-label="Đơn vị lặp"
              value={draft.unit}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, unit: e.target.value as RepeatUnit }))
              }
              className="h-10 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] font-semibold text-[var(--text)] cursor-pointer"
            >
              <option value="ngày">ngày</option>
              <option value="tuần">tuần</option>
              <option value="tháng">tháng</option>
              <option value="năm">năm</option>
            </select>
          </div>

          {/* Horizontal multi-select weekday group ['S','M','T','W','T','F','S'] */}
          <div className="flex flex-col gap-2">
            <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)]">
              Ngày lặp trong tuần
            </span>
            <div className="flex items-center gap-2">
              {WEEKDAY_BUTTONS.map((day) => {
                const selected = draft.weekdays.includes(day.index);
                return (
                  <button
                    key={day.index}
                    type="button"
                    title={day.label}
                    aria-label={day.label}
                    aria-pressed={selected}
                    onClick={() => toggleWeekday(day.index)}
                    className={`w-9 h-9 rounded-full text-[13px] font-semibold flex items-center justify-center transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#FCA311] text-[#14213D]'
                        : 'bg-transparent border border-[var(--border)] text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)]'
                    }`}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kết thúc: vertical single-select radio group */}
          <div className="flex flex-col gap-3">
            <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)]">
              Kết thúc
            </span>

            <div className="flex flex-col gap-2.5">
              {/* Không bao giờ */}
              <label className="flex items-center gap-3 cursor-pointer min-h-[36px]">
                <input
                  type="radio"
                  name="repeat-end-type"
                  checked={draft.endType === 'never'}
                  onChange={() =>
                    setDraft((prev) => ({ ...prev, endType: 'never' as RepeatEndType }))
                  }
                  className="w-4 h-4 accent-[#FCA311] cursor-pointer"
                />
                <span className="text-[14px] leading-[20px] text-[var(--text-body)]">
                  Không bao giờ
                </span>
              </label>

              {/* Vào + calendar-component */}
              <label className="flex items-center justify-between gap-3 cursor-pointer min-h-[40px]">
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="repeat-end-type"
                    checked={draft.endType === 'on_date'}
                    onChange={() =>
                      setDraft((prev) => ({ ...prev, endType: 'on_date' as RepeatEndType }))
                    }
                    className="w-4 h-4 accent-[#FCA311] cursor-pointer"
                  />
                  <span className="text-[14px] leading-[20px] text-[var(--text-body)]">Vào</span>
                </span>
                <input
                  type="date"
                  disabled={draft.endType !== 'on_date'}
                  value={draft.endDate}
                  onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] text-[var(--text)] tabular-nums disabled:opacity-45"
                />
              </label>

              {/* Sau khi lặp + number-spinner */}
              <label className="flex items-center justify-between gap-3 cursor-pointer min-h-[40px]">
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="repeat-end-type"
                    checked={draft.endType === 'after_count'}
                    onChange={() =>
                      setDraft((prev) => ({ ...prev, endType: 'after_count' as RepeatEndType }))
                    }
                    className="w-4 h-4 accent-[#FCA311] cursor-pointer"
                  />
                  <span className="text-[14px] leading-[20px] text-[var(--text-body)]">
                    Sau khi lặp
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <div
                    className={`inline-flex items-center rounded-[8px] bg-transparent border border-[var(--border)] h-9 overflow-hidden ${
                      draft.endType !== 'after_count' ? 'opacity-45 pointer-events-none' : ''
                    }`}
                  >
                    <button
                      type="button"
                      aria-label="Giảm số lần lặp"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, endCount: Math.max(1, prev.endCount - 1) }))
                      }
                      className="w-8 h-full flex items-center justify-center bg-transparent text-[var(--text)] hover:bg-[var(--surface-card-hover)] cursor-pointer"
                    >
                      <IconMinus size={14} stroke={2} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      aria-label="Số lần lặp tối đa"
                      value={draft.endCount}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setDraft((prev) => ({
                          ...prev,
                          endCount: Number.isNaN(n) ? 1 : Math.max(1, n),
                        }));
                      }}
                      className="w-11 h-full text-center bg-transparent text-[13px] font-semibold text-[var(--text)] tabular-nums focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Tăng số lần lặp"
                      onClick={() => setDraft((prev) => ({ ...prev, endCount: prev.endCount + 1 }))}
                      className="w-8 h-full flex items-center justify-center bg-transparent text-[var(--text)] hover:bg-[var(--surface-card-hover)] cursor-pointer"
                    >
                      <IconPlus size={14} stroke={2} />
                    </button>
                  </div>
                  <span className="text-[13px] text-[var(--text-muted)]">lần</span>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <p className="text-[13px] leading-[18px] font-semibold text-[var(--destroy-fg)]">
              {error}
            </p>
          )}
        </div>

        <div className="h-px w-full bg-[var(--divider)]" />

        {/* Footer: horizontal right-aligned Hủy (ghost) + Tạo (filled) */}
        <div className="flex items-center justify-end gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-[8px] bg-transparent text-[14px] leading-[20px] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[14px] leading-[20px] font-semibold hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
          >
            Tạo
          </button>
        </div>
      </div>
    </div>
  );
}
