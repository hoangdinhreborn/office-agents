import { IconX } from '@tabler/icons-react';
import { useEffect } from 'react';
import type { ProjectIconCode } from '../types/workspace';
import { PROJECT_ICON_OPTIONS } from '../utils/format';
import { ProjectIcon } from './ProjectIcon';

interface PickIconDialogProps {
  open: boolean;
  selectedIcon: ProjectIconCode;
  onSelect: (code: ProjectIconCode) => void;
  onClose: () => void;
}

export function PickIconDialog({
  open,
  selectedIcon,
  onSelect,
  onClose,
}: PickIconDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pick-icon-title"
    >
      <div
        className="w-full max-w-[460px] rounded-[16px] bg-[var(--surface)] elevated-container flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: horizontal, left text "Chọn nhãn", right icon x */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0">
          <h3 id="pick-icon-title" className="text-[20px] leading-[24px] font-semibold text-[var(--text)]">
            Chọn nhãn
          </h3>
          <button
            type="button"
            aria-label="Đóng hộp thoại chọn nhãn"
            title="Đóng"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <IconX size={20} stroke={1.75} />
          </button>
        </div>

        <div className="h-px w-full bg-[var(--divider)] shrink-0" />

        {/* Content: scroll enable, grid 5 columns, centered filled icon items */}
        <div className="scroll-area p-6">
          <div className="grid grid-cols-5 gap-3">
            {PROJECT_ICON_OPTIONS.map((opt) => {
              const isSelected = selectedIcon === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  title={opt.label}
                  aria-label={`Chọn nhãn ${opt.label}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onSelect(opt.code);
                    onClose();
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 aspect-square rounded-[12px] transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#FCA311] text-[#14213D]'
                      : 'bg-[var(--surface-recessed)] text-[var(--text-body)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
                  }`}
                >
                  <ProjectIcon code={opt.code} size={22} />
                  <span className="text-[12px] leading-[16px] font-semibold truncate max-w-[90%]">
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
