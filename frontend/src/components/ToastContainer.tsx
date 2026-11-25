import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconInfoCircleFilled,
  IconTrashFilled,
  IconX,
} from '@tabler/icons-react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { ToastVariant } from '../types/workspace';

const VARIANT_STYLES: Record<
  ToastVariant,
  { container: string; iconColor: string; label: string }
> = {
  success: {
    container: 'bg-[var(--success-bg)] text-[var(--success-fg)]',
    iconColor: 'text-[var(--success-fg)]',
    label: 'Thành công',
  },
  warning: {
    container: 'bg-[var(--warning-bg)] text-[var(--warning-fg)]',
    iconColor: 'text-[var(--warning-icon)]',
    label: 'Lưu ý',
  },
  destroy: {
    container: 'bg-[var(--destroy-bg)] text-[var(--destroy-fg)]',
    iconColor: 'text-[var(--destroy-fg)]',
    label: 'Đã xóa',
  },
  info: {
    container: 'bg-[var(--surface)] text-[var(--text)]',
    iconColor: 'text-[var(--accent-ink)]',
    label: 'Thông báo',
  },
};

function ToastIcon({ variant, className }: { variant: ToastVariant; className: string }) {
  switch (variant) {
    case 'success':
      return <IconCircleCheckFilled size={18} className={className} />;
    case 'warning':
      return <IconAlertTriangleFilled size={18} className={className} />;
    case 'destroy':
      return <IconTrashFilled size={18} className={className} />;
    default:
      return <IconInfoCircleFilled size={18} className={className} />;
  }
}

export function ToastContainer() {
  const toasts = useWorkspaceStore((s) => s.toasts);
  const dismissToast = useWorkspaceStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2.5 max-w-[420px] w-[calc(100%-2rem)] pointer-events-none"
    >
      {toasts.map((toast) => {
        const style = VARIANT_STYLES[toast.variant];
        return (
          <div
            key={toast.id}
            role="status"
            className={`w-full pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-[12px] elevated-container ${style.container}`}
          >
            <ToastIcon variant={toast.variant} className={`shrink-0 ${style.iconColor}`} />
            <p className="text-[14px] leading-[20px] font-semibold flex-1 min-w-0">
              {toast.message}
            </p>
            {toast.undoLabel && toast.onUndo && (
              <button
                type="button"
                onClick={() => {
                  toast.onUndo?.();
                  dismissToast(toast.id);
                }}
                className="px-3 py-1.5 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[13px] leading-[18px] font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {toast.undoLabel}
              </button>
            )}
            <button
              type="button"
              aria-label="Đóng thông báo"
              onClick={() => dismissToast(toast.id)}
              className="p-1.5 rounded-[8px] bg-transparent hover:bg-current/10 transition-colors shrink-0 cursor-pointer"
            >
              <IconX size={16} stroke={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
