import { IconAlertTriangle, IconLoader2, IconRefresh, IconTag, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { MemberRole, ProjectIconCode, ProjectMember } from '../types/workspace';
import {
  memberEmailSchema,
  PROJECT_ICON_OPTIONS,
  projectTitleSchema,
  truncate18,
} from '../utils/format';
import { PickIconDialog } from './PickIconDialog';
import { ProjectIcon } from './ProjectIcon';

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

function suggestLabelFromTitle(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 26);
}

export function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  const projects = useWorkspaceStore((s) => s.projects);
  const mailboxLabels = useWorkspaceStore((s) => s.mailboxLabels);
  const isFetchingMailboxLabels = useWorkspaceStore((s) => s.isFetchingMailboxLabels);
  const fetchMailboxLabels = useWorkspaceStore((s) => s.fetchMailboxLabels);
  const createProject = useWorkspaceStore((s) => s.createProject);

  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [icon, setIcon] = useState<ProjectIconCode>('briefcase');
  const [pickIconOpen, setPickIconOpen] = useState(false);

  // 1 Project = 1 Mail Label: pick existing fetched label OR create new label
  const [labelMode, setLabelMode] = useState<'existing' | 'create'>('existing');
  const [selectedLabelId, setSelectedLabelId] = useState<string>('');
  const [newLabelName, setNewLabelName] = useState('');
  const [labelTouched, setLabelTouched] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);

  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);

  // Map labelId -> Project title for detecting already-linked labels
  const labelOwnerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      if (p.config.mailLabelId) {
        map.set(p.config.mailLabelId, p.title);
      }
    }
    return map;
  }, [projects]);

  const firstUnassignedLabel = useMemo(
    () => mailboxLabels.find((l) => !labelOwnerMap.has(l.id)) ?? mailboxLabels[0] ?? null,
    [mailboxLabels, labelOwnerMap]
  );

  // Auto-select first unassigned mailbox label when opening dialog
  useEffect(() => {
    if (!open) return;
    if (!selectedLabelId && firstUnassignedLabel) {
      setSelectedLabelId(firstUnassignedLabel.id);
    }
  }, [open, selectedLabelId, firstUnassignedLabel]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pickIconOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, pickIconOpen, onClose]);

  if (!open) return null;

  const selectedIconMeta =
    PROJECT_ICON_OPTIONS.find((item) => item.code === icon) ?? PROJECT_ICON_OPTIONS[0];

  const selectedLabelOwner = selectedLabelId ? labelOwnerMap.get(selectedLabelId) : undefined;

  const handleAddMember = () => {
    const parsed = memberEmailSchema.safeParse(emailInput);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'Email không hợp lệ.');
      return;
    }
    const normalized = parsed.data.toLowerCase();
    if (members.some((m) => m.email.toLowerCase() === normalized)) {
      setEmailError('Địa chỉ email này đã có trong danh sách.');
      return;
    }
    setMembers((prev) => [
      {
        id: `mem-${Date.now()}-${prev.length}`,
        email: normalized,
        role: normalized.endsWith('@soviectech.vn') ? 'nội bộ' : 'khách',
      },
      ...prev,
    ]);
    setEmailInput('');
    setEmailError(null);
  };

  const handleRoleChange = (id: string, role: MemberRole) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
  };

  const handleRemoveMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const resetAndClose = () => {
    setTitle('');
    setTitleError(null);
    setIcon('briefcase');
    setLabelMode('existing');
    setSelectedLabelId('');
    setNewLabelName('');
    setLabelTouched(false);
    setLabelError(null);
    setEmailInput('');
    setEmailError(null);
    setMembers([]);
    onClose();
  };

  const handleFetchLabels = async () => {
    const fetched = await fetchMailboxLabels();
    if (!selectedLabelId && fetched.length > 0) {
      const unassigned = fetched.find((l) => !labelOwnerMap.has(l.id)) ?? fetched[0];
      setSelectedLabelId(unassigned.id);
    }
  };

  const handleSubmit = async () => {
    if (isSaving) return;
    const parsed = projectTitleSchema.safeParse(title);
    if (!parsed.success) {
      setTitleError(parsed.error.issues[0]?.message ?? 'Vui lòng nhập tên dự án.');
      return;
    }

    if (labelMode === 'create') {
      const candidateLabel = newLabelName.trim() || suggestLabelFromTitle(parsed.data);
      if (!candidateLabel) {
        setLabelError('Vui lòng nhập tên nhãn email mới.');
        return;
      }
      setIsSaving(true);
      const created = await createProject({
        title: parsed.data,
        icon,
        members,
        mailLabelName: candidateLabel,
        createNewLabel: true,
      });
      setIsSaving(false);
      if (!created) { setLabelError('Chưa lưu được dự án. Kiểm tra thông báo lỗi và nhãn Gmail.'); return; }
    } else {
      const chosen = mailboxLabels.find((l) => l.id === selectedLabelId);
      if (!chosen) {
        setLabelError('Vui lòng chọn một nhãn email hoặc chuyển sang tạo nhãn mới.');
        return;
      }
      setIsSaving(true);
      const created = await createProject({
        title: parsed.data,
        icon,
        members,
        mailLabelId: chosen.id,
        mailLabelName: chosen.name,
        createNewLabel: false,
      });
      setIsSaving(false);
      if (!created) { setLabelError('Chưa lưu được dự án. Nhãn Gmail có thể đã thuộc dự án khác.'); return; }
    }

    resetAndClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4"
        onClick={resetAndClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-dialog-title"
      >
        <div
          className="w-full max-w-[540px] rounded-[16px] bg-[var(--surface)] elevated-container flex flex-col max-h-[88vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header: horizontal, left "Dự án mới", right icon x */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0">
            <h2
              id="new-project-dialog-title"
              className="text-[20px] leading-[24px] font-semibold text-[var(--text)]"
            >
              Dự án mới
            </h2>
            <button
              type="button"
              aria-label="Đóng hộp thoại dự án mới"
              title="Đóng"
              onClick={resetAndClose}
              className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              <IconX size={20} stroke={1.75} />
            </button>
          </div>

          <div className="h-px w-full bg-[var(--divider)] shrink-0" />

          {/* Content: stacked */}
          <div className="p-6 flex flex-col gap-5 overflow-y-auto scroll-area">
            {/* Đặt tên dự án */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="project-name-input"
                className="text-[14px] leading-[20px] font-semibold text-[var(--text)]"
              >
                Đặt tên dự án
              </label>
              <input
                id="project-name-input"
                type="text"
                value={title}
                onChange={(e) => {
                  const val = e.target.value;
                  setTitle(val);
                  if (titleError) setTitleError(null);
                  if (!labelTouched) {
                    setNewLabelName(suggestLabelFromTitle(val));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
                placeholder="Ví dụ: Tổng hợp hợp đồng Quý 4"
                className="w-full h-10 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] leading-[20px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
              />
              {titleError && (
                <p className="text-[12px] leading-[18px] font-semibold text-[var(--destroy-fg)]">
                  {titleError}
                </p>
              )}
            </div>

            {/* Biểu tượng dự án + nút Duyệt */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)]">
                  Biểu tượng
                </span>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-[var(--surface-recessed)] text-[var(--text)]">
                  <ProjectIcon code={icon} size={18} className="text-[var(--accent-ink)]" />
                  <span className="text-[13px] leading-[20px] font-semibold">
                    {selectedIconMeta.label}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPickIconOpen(true)}
                className="px-4 py-2 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] leading-[20px] font-semibold text-[var(--text)] hover:border-[var(--border-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Duyệt
              </button>
            </div>

            {/* Nhãn email dự án (1 dự án = 1 nhãn hộp thư, hỗ trợ fetch nhãn hoặc tạo nhãn mới) */}
            <div className="rounded-[12px] bg-[var(--surface-recessed)]/65 border border-[var(--border)]/60 p-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <IconTag size={16} stroke={1.9} className="text-[var(--accent-ink)] shrink-0" />
                  <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)]">
                    Nhãn email đồng bộ
                  </span>
                </div>

                <div
                  role="tablist"
                  aria-label="Chọn chế độ nhãn email"
                  className="inline-flex items-center p-0.5 rounded-[8px] bg-[var(--surface-track)] gap-0.5"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={labelMode === 'existing'}
                    onClick={() => {
                      setLabelMode('existing');
                      setLabelError(null);
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-[12px] leading-[16px] font-semibold transition-colors cursor-pointer ${
                      labelMode === 'existing'
                        ? 'bg-[var(--surface)] text-[var(--text)]'
                        : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    Nhãn có sẵn
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={labelMode === 'create'}
                    onClick={() => {
                      setLabelMode('create');
                      setLabelError(null);
                      if (!newLabelName && title.trim()) {
                        setNewLabelName(suggestLabelFromTitle(title));
                      }
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-[12px] leading-[16px] font-semibold transition-colors cursor-pointer ${
                      labelMode === 'create'
                        ? 'bg-[var(--surface)] text-[var(--text)]'
                        : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    Tạo nhãn mới
                  </button>
                </div>
              </div>

              {labelMode === 'existing' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Chọn nhãn email từ hộp thư"
                      value={selectedLabelId}
                      onChange={(e) => {
                        setSelectedLabelId(e.target.value);
                        if (labelError) setLabelError(null);
                      }}
                      className="flex-1 min-w-0 h-10 px-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--text)] hover:border-[var(--border-hover)] cursor-pointer"
                    >
                      {mailboxLabels.map((lbl) => {
                        const owner = labelOwnerMap.get(lbl.id);
                        return (
                          <option key={lbl.id} value={lbl.id}>
                            {lbl.name}
                            {owner ? ` — Đang gắn: ${owner}` : ''}
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      disabled={isFetchingMailboxLabels}
                      onClick={handleFetchLabels}
                      title="Tải danh sách nhãn mới nhất từ hộp thư"
                      className="h-10 px-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[13px] font-semibold text-[var(--text)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-card-hover)] disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      {isFetchingMailboxLabels ? (
                        <IconLoader2 size={15} className="animate-spin text-[var(--accent-ink)]" />
                      ) : (
                        <IconRefresh size={15} stroke={1.75} />
                      )}
                      <span>Tải nhãn</span>
                    </button>
                  </div>

                  {selectedLabelOwner ? (
                    <div className="rounded-[8px] bg-[var(--warning-bg)] text-[var(--warning-fg)] px-3 py-2 flex items-start gap-2 text-[12px] leading-[17px]">
                      <IconAlertTriangle
                        size={15}
                        stroke={2}
                        className="text-[var(--warning-icon)] shrink-0 mt-0.5"
                      />
                      <span>
                        Nhãn này đang gắn với dự án <strong>{selectedLabelOwner}</strong>. Nên chọn
                        nhãn chưa gắn hoặc tạo nhãn mới để tránh trùng luồng đồng bộ.
                      </span>
                    </div>
                  ) : (
                    <p className="text-[12px] leading-[17px] text-[var(--text-muted)]">
                      Mỗi dự án gắn với 1 nhãn hộp thư. Agent sẽ tự động gắn nhãn này cho các email
                      phù hợp gửi đến.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    value={newLabelName}
                    onChange={(e) => {
                      setNewLabelName(e.target.value);
                      setLabelTouched(true);
                      if (labelError) setLabelError(null);
                    }}
                    placeholder="Ví dụ: DuAn-KhachHangA"
                    aria-label="Tên nhãn email mới"
                    className="w-full h-10 px-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[13px] font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                  />
                  <p className="text-[12px] leading-[17px] text-[var(--text-muted)]">
                    Nhãn mới sẽ được tạo trên hộp thư và liên kết trực tiếp cho dự án này.
                  </p>
                </div>
              )}

              {labelError && (
                <p className="text-[12px] leading-[18px] font-semibold text-[var(--destroy-fg)]">
                  {labelError}
                </p>
              )}
            </div>

            {/* Thành viên + nút Thêm + input email + scrollable member list */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-4">
                <label
                  htmlFor="member-email-input"
                  className="text-[14px] leading-[20px] font-semibold text-[var(--text)]"
                >
                  Thành viên
                </label>
                <button
                  type="button"
                  onClick={handleAddMember}
                  className="px-4 py-1.5 rounded-[8px] bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)] text-[14px] leading-[20px] font-semibold hover:bg-[var(--primary-btn-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Thêm
                </button>
              </div>

              <input
                id="member-email-input"
                type="email"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMember();
                  }
                }}
                placeholder="Nhập địa chỉ mail thành viên"
                className="w-full h-10 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] leading-[20px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
              />
              {emailError && (
                <p className="text-[12px] leading-[18px] font-semibold text-[var(--destroy-fg)]">
                  {emailError}
                </p>
              )}

              {/* Scrollable stacked list of mem-component */}
              <div className="scroll-area max-h-[160px] rounded-[10px] bg-[var(--surface-recessed)] p-2 flex flex-col gap-1">
                {members.length === 0 ? (
                  <p className="py-5 px-3 text-center text-[13px] leading-[20px] text-[var(--text-muted)]">
                    Chưa có thành viên theo dõi email. Nhập địa chỉ email ở trên rồi nhấn Thêm.
                  </p>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] bg-transparent hover:bg-[var(--surface-card-hover)] transition-colors"
                    >
                      <span
                        title={member.email}
                        className="text-[14px] leading-[20px] text-[var(--text-body)] font-mono whitespace-nowrap"
                      >
                        {truncate18(member.email)}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          aria-label={`Vai trò của ${member.email}`}
                          value={member.role}
                          onChange={(e) =>
                            handleRoleChange(member.id, e.target.value as MemberRole)
                          }
                          className="h-8 px-2.5 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] leading-[18px] font-semibold text-[var(--text)] cursor-pointer"
                        >
                          <option value="nội bộ">nội bộ</option>
                          <option value="khách">khách</option>
                        </select>
                        <button
                          type="button"
                          aria-label={`Xóa thành viên ${member.email}`}
                          title="Xóa thành viên"
                          onClick={() => handleRemoveMember(member.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--destroy-bg)] hover:text-[var(--destroy-fg-hover)] transition-colors cursor-pointer"
                        >
                          <IconX size={16} stroke={1.75} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-[var(--divider)] shrink-0" />

          {/* Footer: right-aligned Hủy (outline) + Tạo (filled) */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 shrink-0">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] leading-[20px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] transition-colors whitespace-nowrap cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSubmit()}
              className="px-5 py-2 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[14px] leading-[20px] font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap cursor-pointer"
            >
              Tạo
            </button>
          </div>
        </div>
      </div>

      <PickIconDialog
        open={pickIconOpen}
        selectedIcon={icon}
        onSelect={(code) => setIcon(code)}
        onClose={() => setPickIconOpen(false)}
      />
    </>
  );
}

