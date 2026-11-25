import { useState } from 'react';
import { AlertDialog } from 'radix-ui';
import { Button } from './ui/button';

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean>;
}

export function ConfirmDeleteDialog({ open, title, description, onOpenChange, onConfirm }: ConfirmDeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog.Root open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[var(--surface-panel)] p-6 shadow-xl flex flex-col gap-4">
          <AlertDialog.Title className="text-lg font-semibold text-[var(--text)]">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-[var(--text-muted)]">{description}</AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild><Button variant="outline" disabled={busy}>Hủy</Button></AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="destructive" disabled={busy} onClick={async (event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                try { if (await onConfirm()) onOpenChange(false); }
                finally { setBusy(false); }
              }}>{busy ? 'Đang xóa…' : 'Xóa vĩnh viễn'}</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
