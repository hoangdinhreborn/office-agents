import {
  IconAlertTriangle,
  IconCheck,
  IconFile,
  IconFileTypePdf,
  IconFolderOpen,
  IconLink,
  IconLoader2,
  IconMailPlus,
  IconPaperclip,
  IconPlus,
  IconRefresh,
  IconSend,
  IconUpload,
  IconUserPlus,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type {
  PdfResource,
  Project,
  ReplyAttachmentFile,
  ReplyAttachmentLink,
  ResourceItem,
  SolutionOption,
} from '../types/workspace';
import { formatBytesVi, memberEmailSchema } from '../utils/format';

interface ReplyMailDialogProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  resource: ResourceItem;
  solution: SolutionOption;
  solutionIndex: number;
}

interface SuggestedSlot {
  id: string;
  kind: 'file' | 'link';
  label: string;
  placeholder: string;
  dismissed?: boolean;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '- ')
    .trim();
}

function inferSuggestedSlots(resource: ResourceItem, solution: SolutionOption): SuggestedSlot[] {
  const combined = [
    resource.type === 'mail' ? resource.subject : resource.fileName,
    resource.summaryByStyle['ngắn'],
    solution.titleMarkdown,
  ]
    .join(' ')
    .toLowerCase();

  const slots: SuggestedSlot[] = [];

  // Infer link slots from context
  if (combined.includes('figma') || combined.includes('thiết kế') || combined.includes('giao diện')) {
    slots.push({
      id: 'slot-link-figma',
      kind: 'link',
      label: 'Link Figma',
      placeholder: 'https://www.figma.com/design/...',
    });
  } else if (combined.includes('github') || combined.includes('issue') || combined.includes('mã nguồn')) {
    slots.push({
      id: 'slot-link-github',
      kind: 'link',
      label: 'Link GitHub Issue / PR',
      placeholder: 'https://github.com/org/repo/issues/...',
    });
  } else if (combined.includes('canva') || combined.includes('slide') || combined.includes('trình bày')) {
    slots.push({
      id: 'slot-link-canva',
      kind: 'link',
      label: 'Link Canva / Slide trực tuyến',
      placeholder: 'https://www.canva.com/design/...',
    });
  } else {
    slots.push({
      id: 'slot-link-ref',
      kind: 'link',
      label: 'Liên kết tài liệu / sản phẩm (Figma, Canva, GitHub, Docs...)',
      placeholder: 'https://...',
    });
  }

  // Infer file slots from context
  if (combined.includes('slide') || combined.includes('trình bày') || combined.includes('pptx')) {
    slots.push({
      id: 'slot-file-pptx',
      kind: 'file',
      label: 'Tệp trình bày (.pptx / .pdf)',
      placeholder: 'Chọn tệp từ máy hoặc từ Tài nguyên',
    });
  } else if (
    combined.includes('hợp đồng') ||
    combined.includes('phụ lục') ||
    combined.includes('ngân sách') ||
    combined.includes('báo cáo') ||
    combined.includes('hồ sơ')
  ) {
    slots.push({
      id: 'slot-file-doc',
      kind: 'file',
      label: 'Tài liệu đính kèm (.pdf, .docx, .xlsx, .pptx)',
      placeholder: 'Chọn tệp từ máy hoặc từ Tài nguyên',
    });
  } else {
    slots.push({
      id: 'slot-file-general',
      kind: 'file',
      label: 'Tệp đính kèm cần gửi',
      placeholder: 'Chọn tệp từ máy hoặc từ Tài nguyên',
    });
  }

  return slots;
}

function buildAttachmentBlock(
  files: ReplyAttachmentFile[],
  links: ReplyAttachmentLink[]
): string {
  if (files.length === 0 && links.length === 0) return '';
  const lines: string[] = ['Tài liệu & liên kết đính kèm:'];
  for (const link of links) {
    lines.push(`- ${link.label}: ${link.url}`);
  }
  for (const file of files) {
    lines.push(`- [Tệp đính kèm] ${file.name} (${file.sizeLabel})`);
  }
  return lines.join('\n');
}

function buildInitialDraftBody(params: {
  currentUser: { name: string; role: string; email: string };
  resource: ResourceItem;
  solution: SolutionOption;
  isExternal: boolean;
  files: ReplyAttachmentFile[];
  links: ReplyAttachmentLink[];
}): string {
  const { resource, solution, isExternal, files, links, currentUser } = params;
  const solutionPlain = stripMarkdown(solution.titleMarkdown);
  const greeting = isExternal ? 'Kính gửi Anh/Chị,' : 'Chào mọi người,';
  const intro =
    resource.type === 'mail'
      ? `Cảm ơn Anh/Chị đã gửi trao đổi về "${resource.subject}". Sau khi rà soát nội dung và các tài liệu liên quan, phía em đề xuất phương án xử lý như sau:`
      : `Gửi Anh/Chị đề xuất xử lý dựa trên tài liệu "${resource.fileName}":`;

  const closing = isExternal
    ? `Rất mong nhận được phản hồi của Anh/Chị để hai bên sớm thống nhất triển khai.\n\nTrân trọng,\n${currentUser.name}\n${currentUser.role}`
    : `Mọi người xem qua và phản hồi nếu cần điều chỉnh thêm nhé.\n\nCảm ơn mọi người,\n${currentUser.name}`;

  const attachmentBlock = buildAttachmentBlock(files, links);

  return [greeting, intro, solutionPlain, attachmentBlock, closing].filter(Boolean).join('\n\n');
}

function syncAttachmentBlockInBody(
  currentBody: string,
  files: ReplyAttachmentFile[],
  links: ReplyAttachmentLink[]
): string {
  const marker = 'Tài liệu & liên kết đính kèm:';
  const nextBlock = buildAttachmentBlock(files, links);

  const markerIdx = currentBody.indexOf(marker);
  if (markerIdx !== -1) {
    const before = currentBody.slice(0, markerIdx).trimEnd();
    const afterMarker = currentBody.slice(markerIdx);
    const doubleNewlineIdx = afterMarker.indexOf('\n\n');
    const after = doubleNewlineIdx !== -1 ? afterMarker.slice(doubleNewlineIdx + 2) : '';
    return [before, nextBlock, after].filter(Boolean).join('\n\n');
  }

  if (!nextBlock) return currentBody;

  const closingTriggers = ['Rất mong nhận được phản hồi', 'Mọi người xem qua', 'Trân trọng,', 'Cảm ơn mọi người,'];
  for (const trigger of closingTriggers) {
    const idx = currentBody.indexOf(trigger);
    if (idx !== -1) {
      const before = currentBody.slice(0, idx).trimEnd();
      const after = currentBody.slice(idx).trimStart();
      return [before, nextBlock, after].filter(Boolean).join('\n\n');
    }
  }

  return `${currentBody.trimEnd()}\n\n${nextBlock}`;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractDomainLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function ReplyMailDialog({
  open,
  onClose,
  project,
  resource,
  solution,
  solutionIndex,
}: ReplyMailDialogProps) {
  const currentUser = useWorkspaceStore((s) => s.currentUser);
  const sendSolutionReplyMail = useWorkspaceStore((s) => s.sendSolutionReplyMail);

  const [toEmails, setToEmails] = useState<string[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [activeRecipientField, setActiveRecipientField] = useState<'to' | 'cc'>('to');
  const [recipientInput, setRecipientInput] = useState('');
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [saveNewEmailsToProject, setSaveNewEmailsToProject] = useState(true);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Smart suggested slots + multi-file & multi-link lists
  const [suggestedSlots, setSuggestedSlots] = useState<SuggestedSlot[]>([]);
  const [files, setFiles] = useState<ReplyAttachmentFile[]>([]);
  const [links, setLinks] = useState<ReplyAttachmentLink[]>([]);

  // Active inline inputs for adding link or choosing project PDFs
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [activeLinkSlotId, setActiveLinkSlotId] = useState<string | null>(null);
  const [linkLabelDraft, setLinkLabelDraft] = useState('');
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const [resourceFilePickerOpen, setResourceFilePickerOpen] = useState(false);
  const [activeFileSlotId, setActiveFileSlotId] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const fileUploadInputRef = useRef<HTMLInputElement>(null);
  const recipientContainerRef = useRef<HTMLDivElement>(null);

  const projectPdfResources = useMemo(
    () => project.resources.filter((r): r is PdfResource => r.type === 'pdf'),
    [project.resources]
  );

  const memberRoleMap = useMemo(() => {
    const map = new Map<string, 'nội bộ' | 'khách'>();
    for (const m of project.members) {
      map.set(m.email.toLowerCase(), m.role);
    }
    return map;
  }, [project.members]);

  const getEmailRole = (email: string): 'nội bộ' | 'khách' => {
    const lower = email.toLowerCase();
    return memberRoleMap.get(lower) ?? (lower.endsWith('@soviectech.vn') ? 'nội bộ' : 'khách');
  };

  // Initialize dialog state whenever opened for a solution
  useEffect(() => {
    if (!open) return;

    const initialTo = resource.type === 'mail' ? [resource.senderEmail] : [];
    const initialIsExternal =
      resource.type === 'mail'
        ? resource.senderRole === 'khách'
        : initialTo.some((e) => getEmailRole(e) === 'khách');

    const initialSubject =
      resource.type === 'mail'
        ? resource.subject.toLowerCase().startsWith('re:')
          ? resource.subject
          : `Re: ${resource.subject}`
        : `Đề xuất xử lý — ${resource.fileName.replace(/\.pdf$/i, '')}`;

    setToEmails(initialTo);
    setCcEmails([]);
    setShowCc(false);
    setActiveRecipientField('to');
    setRecipientInput('');
    setRecipientPickerOpen(false);
    setRecipientError(null);
    setSaveNewEmailsToProject(true);

    setSubject(initialSubject);
    setFiles([]);
    setLinks([]);
    setSuggestedSlots(inferSuggestedSlots(resource, solution));

    setLinkFormOpen(false);
    setActiveLinkSlotId(null);
    setLinkLabelDraft('');
    setLinkUrlDraft('');
    setLinkError(null);
    setResourceFilePickerOpen(false);
    setActiveFileSlotId(null);
    setFormError(null);
    setIsSending(false);

    setBody(
      buildInitialDraftBody({
        currentUser,
        resource,
        solution,
        isExternal: initialIsExternal,
        files: [],
        links: [],
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource.id, solution.id]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSending) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, isSending, onClose]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        recipientContainerRef.current &&
        !recipientContainerRef.current.contains(e.target as Node)
      ) {
        setRecipientPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const allSelectedEmails = useMemo(
    () => new Set([...toEmails, ...ccEmails].map((e) => e.toLowerCase())),
    [toEmails, ccEmails]
  );

  const newlyTypedEmails = useMemo(() => {
    const existing = new Set(project.members.map((m) => m.email.toLowerCase()));
    return [...toEmails, ...ccEmails].filter((e) => !existing.has(e.toLowerCase()));
  }, [toEmails, ccEmails, project.members]);

  const filteredProjectMembers = useMemo(() => {
    const q = recipientInput.trim().toLowerCase();
    return project.members.filter((m) => {
      if (allSelectedEmails.has(m.email.toLowerCase())) return false;
      if (!q) return true;
      return m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q);
    });
  }, [project.members, allSelectedEmails, recipientInput]);

  const remainingSuggestedSlots = useMemo(
    () => suggestedSlots.filter((s) => !s.dismissed),
    [suggestedSlots]
  );

  const hasExternalRecipient = useMemo(
    () => [...toEmails, ...ccEmails].some((e) => getEmailRole(e) === 'khách'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toEmails, ccEmails, memberRoleMap]
  );

  const addRecipientEmail = (rawEmail: string, target: 'to' | 'cc' = activeRecipientField) => {
    const parsed = memberEmailSchema.safeParse(rawEmail);
    if (!parsed.success) {
      setRecipientError(parsed.error.issues[0]?.message ?? 'Địa chỉ email không hợp lệ.');
      return;
    }
    const normalized = parsed.data.toLowerCase();
    if (allSelectedEmails.has(normalized)) {
      setRecipientError('Địa chỉ email này đã có trong danh sách người nhận.');
      return;
    }
    if (target === 'to') {
      setToEmails((prev) => [...prev, normalized]);
    } else {
      setCcEmails((prev) => [...prev, normalized]);
    }
    setRecipientInput('');
    setRecipientError(null);
    setFormError(null);
  };

  const removeRecipient = (email: string, target: 'to' | 'cc') => {
    if (target === 'to') {
      setToEmails((prev) => prev.filter((e) => e !== email));
    } else {
      setCcEmails((prev) => prev.filter((e) => e !== email));
    }
  };

  const dismissSlot = (slotId: string) => {
    setSuggestedSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, dismissed: true } : s))
    );
  };

  const handleUploadLocalFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const additions: ReplyAttachmentFile[] = Array.from(fileList).map((f, idx) => ({
      id: `file-up-${Date.now()}-${idx}`,
      name: f.name,
      sizeLabel: formatBytesVi(f.size),
      source: 'upload',
    }));

    const nextFiles = [...files, ...additions];
    setFiles(nextFiles);
    setBody((prev) => syncAttachmentBlockInBody(prev, nextFiles, links));
    if (activeFileSlotId) {
      dismissSlot(activeFileSlotId);
      setActiveFileSlotId(null);
    }
  };

  const handleToggleProjectPdfAttachment = (pdf: PdfResource) => {
    const already = files.some((f) => f.source === 'resource' && f.resourceId === pdf.id);
    const nextFiles = already
      ? files.filter((f) => !(f.source === 'resource' && f.resourceId === pdf.id))
      : [
          ...files,
          {
            id: `file-res-${pdf.id}`,
            name: pdf.fileName,
            sizeLabel: pdf.fileSize,
            source: 'resource' as const,
            resourceId: pdf.id,
          },
        ];
    setFiles(nextFiles);
    setBody((prev) => syncAttachmentBlockInBody(prev, nextFiles, links));
    if (!already && activeFileSlotId) {
      dismissSlot(activeFileSlotId);
      setActiveFileSlotId(null);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    const nextFiles = files.filter((f) => f.id !== fileId);
    setFiles(nextFiles);
    setBody((prev) => syncAttachmentBlockInBody(prev, nextFiles, links));
  };

  const handleOpenLinkForm = (slot?: SuggestedSlot) => {
    setLinkFormOpen(true);
    setResourceFilePickerOpen(false);
    setActiveLinkSlotId(slot?.id ?? null);
    setLinkLabelDraft(slot ? slot.label : '');
    setLinkUrlDraft('');
    setLinkError(null);
  };

  const handleConfirmAddLink = () => {
    const urlTrimmed = linkUrlDraft.trim();
    if (!urlTrimmed || !isValidHttpUrl(urlTrimmed)) {
      setLinkError('Vui lòng nhập liên kết hợp lệ bắt đầu bằng https:// hoặc http://');
      return;
    }
    const labelTrimmed = linkLabelDraft.trim() || extractDomainLabel(urlTrimmed);
    const newLink: ReplyAttachmentLink = {
      id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: labelTrimmed,
      url: urlTrimmed,
    };
    const nextLinks = [...links, newLink];
    setLinks(nextLinks);
    setBody((prev) => syncAttachmentBlockInBody(prev, files, nextLinks));

    if (activeLinkSlotId) {
      dismissSlot(activeLinkSlotId);
      setActiveLinkSlotId(null);
    }
    setLinkLabelDraft('');
    setLinkUrlDraft('');
    setLinkError(null);
    setLinkFormOpen(false);
  };

  const handleRemoveLink = (linkId: string) => {
    const nextLinks = links.filter((l) => l.id !== linkId);
    setLinks(nextLinks);
    setBody((prev) => syncAttachmentBlockInBody(prev, files, nextLinks));
  };

  const handleRegenerateBody = () => {
    setBody(
      buildInitialDraftBody({
        currentUser,
        resource,
        solution,
        isExternal: hasExternalRecipient,
        files,
        links,
      })
    );
  };

  const handleSubmitSend = async () => {
    setFormError(null);
    setIsSending(true);
    const result = await sendSolutionReplyMail({
      projectId: project.id,
      resourceId: resource.id,
      solutionId: solution.id,
      toEmails,
      ccEmails,
      subject,
      body,
      files,
      links,
      saveNewEmailsToProject,
    });
    setIsSending(false);
    if (!result.ok) {
      setFormError(result.error ?? 'Không thể gửi email.');
      return;
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4"
      onClick={() => {
        if (!isSending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reply-mail-dialog-title"
    >
      <div
        className="w-full max-w-[680px] rounded-[16px] bg-[var(--surface)] elevated-container flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden native multi-file picker */}
        <input
          ref={fileUploadInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleUploadLocalFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-[10px] bg-[var(--surface-recessed)] border border-[var(--border)]/60 flex items-center justify-center text-[var(--accent-ink)] shrink-0">
              <IconMailPlus size={19} stroke={1.75} />
            </span>
            <div className="min-w-0 flex flex-col">
              <h3
                id="reply-mail-dialog-title"
                className="text-[18px] leading-[24px] font-bold text-[var(--text)] truncate"
              >
                Soạn phản hồi theo Giải pháp {solutionIndex + 1}
              </h3>
              <span className="text-[12px] leading-[16px] text-[var(--text-muted)] truncate">
                {resource.type === 'mail' ? resource.subject : resource.fileName}
              </span>
            </div>
          </div>

          <button
            type="button"
            aria-label="Đóng hộp thoại soạn email"
            disabled={isSending}
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <IconX size={20} stroke={1.75} />
          </button>
        </div>

        <div className="h-px w-full bg-[var(--divider)] shrink-0" />

        {/* Body */}
        <div className="p-6 scroll-area flex-1 flex flex-col gap-4">
          {/* 1. Recipients: To / CC (pick from project.members or add new email) */}
          <div ref={recipientContainerRef} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="reply-recipient-input"
                className="text-[13px] leading-[18px] font-semibold text-[var(--text)]"
              >
                Người nhận (To{showCc ? ' / CC' : ''})
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowCc((prev) => {
                    const next = !prev;
                    if (!next) setActiveRecipientField('to');
                    return next;
                  });
                }}
                className="text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                {showCc ? 'Ẩn CC' : '+ Thêm CC'}
              </button>
            </div>

            {/* Selected To chips */}
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-recessed)]/45 p-2.5 flex flex-col gap-2">
              <div className="flex items-center flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveRecipientField('to')}
                  className={`px-2 py-0.5 rounded-[6px] text-[12px] font-semibold cursor-pointer ${
                    activeRecipientField === 'to'
                      ? 'bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)]'
                      : 'bg-[var(--surface-control)] text-[var(--text-muted)]'
                  }`}
                >
                  To
                </button>
                {toEmails.length === 0 ? (
                  <span className="text-[12px] text-[var(--text-muted)] px-1">
                    Chưa chọn người nhận
                  </span>
                ) : (
                  toEmails.map((email) => {
                    const role = getEmailRole(email);
                    return (
                      <span
                        key={`to-${email}`}
                        className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-[8px] bg-[var(--surface-card)] border border-[var(--border)]/70 text-[12px] leading-[16px] text-[var(--text)]"
                      >
                        <span className="font-mono">{email}</span>
                        <span className="px-1.5 py-0.5 rounded-[5px] bg-[var(--surface-control)] text-[11px] font-semibold text-[var(--text-muted)]">
                          {role}
                        </span>
                        <button
                          type="button"
                          aria-label={`Gỡ ${email}`}
                          onClick={() => removeRecipient(email, 'to')}
                          className="w-4 h-4 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--destroy-fg)] cursor-pointer"
                        >
                          <IconX size={12} stroke={2} />
                        </button>
                      </span>
                    );
                  })
                )}
              </div>

              {showCc && (
                <>
                  <div className="h-px w-full bg-[var(--divider)]" />
                  <div className="flex items-center flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveRecipientField('cc')}
                      className={`px-2 py-0.5 rounded-[6px] text-[12px] font-semibold cursor-pointer ${
                        activeRecipientField === 'cc'
                          ? 'bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)]'
                          : 'bg-[var(--surface-control)] text-[var(--text-muted)]'
                      }`}
                    >
                      CC
                    </button>
                    {ccEmails.length === 0 ? (
                      <span className="text-[12px] text-[var(--text-muted)] px-1">
                        Chọn nút CC rồi thêm người nhận đồng kính gửi
                      </span>
                    ) : (
                      ccEmails.map((email) => {
                        const role = getEmailRole(email);
                        return (
                          <span
                            key={`cc-${email}`}
                            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-[8px] bg-[var(--surface-card)] border border-[var(--border)]/70 text-[12px] leading-[16px] text-[var(--text)]"
                          >
                            <span className="font-mono">{email}</span>
                            <span className="px-1.5 py-0.5 rounded-[5px] bg-[var(--surface-control)] text-[11px] font-semibold text-[var(--text-muted)]">
                              {role}
                            </span>
                            <button
                              type="button"
                              aria-label={`Gỡ CC ${email}`}
                              onClick={() => removeRecipient(email, 'cc')}
                              className="w-4 h-4 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--destroy-fg)] cursor-pointer"
                            >
                              <IconX size={12} stroke={2} />
                            </button>
                          </span>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {/* Search/add email input + dropdown of project members */}
              <div className="relative pt-1">
                <div className="flex items-center gap-2">
                  <input
                    id="reply-recipient-input"
                    type="email"
                    value={recipientInput}
                    onFocus={() => setRecipientPickerOpen(true)}
                    onChange={(e) => {
                      setRecipientInput(e.target.value);
                      setRecipientPickerOpen(true);
                      if (recipientError) setRecipientError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (recipientInput.trim()) {
                          addRecipientEmail(recipientInput, activeRecipientField);
                        }
                      }
                    }}
                    placeholder={`Chọn từ danh sách dự án hoặc nhập email mới cho ${activeRecipientField.toUpperCase()}...`}
                    className="flex-1 min-w-0 h-9 px-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                  />
                  <button
                    type="button"
                    onClick={() => addRecipientEmail(recipientInput, activeRecipientField)}
                    disabled={!recipientInput.trim()}
                    className="h-9 px-3 rounded-[8px] bg-[var(--surface-control)] text-[var(--text)] text-[13px] font-semibold hover:bg-[var(--surface-card-hover)] disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                  >
                    <IconUserPlus size={15} stroke={1.75} />
                    <span>Thêm</span>
                  </button>
                </div>

                {recipientPickerOpen && filteredProjectMembers.length > 0 && (
                  <div className="absolute left-0 right-0 top-[46px] z-20 rounded-[10px] bg-[var(--surface)] border border-[var(--border)] elevated-subtle p-1.5 max-h-[168px] scroll-area flex flex-col gap-0.5">
                    <span className="px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                      Địa chỉ email trong dự án ({filteredProjectMembers.length})
                    </span>
                    {filteredProjectMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          addRecipientEmail(member.email, activeRecipientField);
                          setRecipientPickerOpen(false);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-[8px] bg-transparent hover:bg-[var(--surface-card-hover)] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                      >
                        <span className="text-[13px] font-mono text-[var(--text)] truncate">
                          {member.email}
                        </span>
                        <span className="px-2 py-0.5 rounded-[6px] bg-[var(--surface-control)] text-[11px] font-semibold text-[var(--text-muted)] shrink-0">
                          {member.role}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {recipientError && (
                <p className="text-[12px] font-semibold text-[var(--destroy-fg)]">
                  {recipientError}
                </p>
              )}

              {newlyTypedEmails.length > 0 && (
                <label className="inline-flex items-center gap-2 pt-0.5 text-[12px] text-[var(--text-body)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveNewEmailsToProject}
                    onChange={(e) => setSaveNewEmailsToProject(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#FCA311] cursor-pointer"
                  />
                  <span>
                    Lưu {newlyTypedEmails.length} địa chỉ email mới vào danh sách theo dõi của dự án
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* 2. Subject */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="reply-subject-input"
              className="text-[13px] leading-[18px] font-semibold text-[var(--text)]"
            >
              Tiêu đề email
            </label>
            <input
              id="reply-subject-input"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Nhập tiêu đề email..."
              className="w-full h-10 px-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[14px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
            />
          </div>

          {/* 3. Smart Multi-File & Multi-Link Attachment Component */}
          <div className="rounded-[12px] border border-[var(--border)]/70 bg-[var(--surface-recessed)]/40 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex flex-col">
                <span className="text-[13px] leading-[18px] font-semibold text-[var(--text)]">
                  Tệp & liên kết đính kèm
                </span>
                <span className="text-[12px] leading-[16px] text-[var(--text-muted)]">
                  Bấm vào đầu mục gợi ý bên dưới hoặc thêm nhiều tệp / liên kết tùy ý
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setActiveFileSlotId(null);
                    fileUploadInputRef.current?.click();
                  }}
                  className="h-8 px-2.5 rounded-[8px] bg-[var(--surface-card)] border border-[var(--border)] text-[12px] font-semibold text-[var(--text)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-card-hover)] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <IconUpload size={14} stroke={1.75} />
                  <span>Thêm tệp</span>
                </button>

                {projectPdfResources.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setResourceFilePickerOpen((v) => !v);
                      setLinkFormOpen(false);
                    }}
                    className={`h-8 px-2.5 rounded-[8px] border text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      resourceFilePickerOpen
                        ? 'bg-[var(--primary-btn-bg)] border-transparent text-[var(--primary-btn-fg)]'
                        : 'bg-[var(--surface-card)] border-[var(--border)] text-[var(--text)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-card-hover)]'
                    }`}
                  >
                    <IconFolderOpen size={14} stroke={1.75} />
                    <span>Từ Tài nguyên</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenLinkForm()}
                  className={`h-8 px-2.5 rounded-[8px] border text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    linkFormOpen
                      ? 'bg-[var(--primary-btn-bg)] border-transparent text-[var(--primary-btn-fg)]'
                      : 'bg-[var(--surface-card)] border-[var(--border)] text-[var(--text)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-card-hover)]'
                  }`}
                >
                  <IconLink size={14} stroke={1.75} />
                  <span>Thêm liên kết</span>
                </button>
              </div>
            </div>

            {/* Suggested clickable input slots (dashed) */}
            {remainingSuggestedSlots.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {remainingSuggestedSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="inline-flex items-center rounded-[8px] border border-dashed border-[var(--border)] bg-[var(--surface)]/70 hover:border-[var(--border-hover)] transition-colors overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (slot.kind === 'link') {
                          handleOpenLinkForm(slot);
                        } else {
                          setActiveFileSlotId(slot.id);
                          fileUploadInputRef.current?.click();
                        }
                      }}
                      className="h-8 pl-2.5 pr-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-body)] hover:text-[var(--text)] cursor-pointer"
                    >
                      <IconPlus size={13} stroke={2} className="text-[var(--accent-ink)]" />
                      {slot.kind === 'link' ? (
                        <IconLink size={13} stroke={1.75} />
                      ) : (
                        <IconPaperclip size={13} stroke={1.75} />
                      )}
                      <span>{slot.label}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Bỏ qua gợi ý ${slot.label}`}
                      title="Bỏ qua gợi ý này"
                      onClick={() => dismissSlot(slot.id)}
                      className="h-8 px-2 border-l border-dashed border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-card-hover)] cursor-pointer"
                    >
                      <IconX size={12} stroke={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Inline Project Resources Picker (multi-select PDFs from project) */}
            {resourceFilePickerOpen && (
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[var(--text)]">
                    Chọn tệp từ Tài nguyên dự án
                  </span>
                  <button
                    type="button"
                    onClick={() => setResourceFilePickerOpen(false)}
                    className="text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                  >
                    Xong
                  </button>
                </div>
                <div className="flex flex-col gap-1 max-h-[132px] scroll-area">
                  {projectPdfResources.map((pdf) => {
                    const checked = files.some(
                      (f) => f.source === 'resource' && f.resourceId === pdf.id
                    );
                    return (
                      <label
                        key={pdf.id}
                        className={`px-2.5 py-1.5 rounded-[8px] flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          checked
                            ? 'bg-[var(--surface-control)]'
                            : 'hover:bg-[var(--surface-card-hover)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleProjectPdfAttachment(pdf)}
                            className="w-4 h-4 accent-[#FCA311] shrink-0 cursor-pointer"
                          />
                          <IconFileTypePdf
                            size={15}
                            stroke={1.75}
                            className="text-[#E34D45] shrink-0"
                          />
                          <span className="text-[12px] font-semibold text-[var(--text)] truncate">
                            {pdf.fileName}
                          </span>
                        </div>
                        <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                          {pdf.fileSize}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inline Link Composer (add Figma, Canva, GitHub Issue, Docs, etc.) */}
            {linkFormOpen && (
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col gap-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={linkLabelDraft}
                    onChange={(e) => setLinkLabelDraft(e.target.value)}
                    placeholder="Tên liên kết (vd: Link Figma bản v2, GitHub Issue #42)"
                    className="h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                  />
                  <input
                    type="url"
                    value={linkUrlDraft}
                    onChange={(e) => {
                      setLinkUrlDraft(e.target.value);
                      if (linkError) setLinkError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConfirmAddLink();
                      }
                    }}
                    placeholder="https://figma.com/... hoặc https://github.com/..."
                    className="h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                  />
                </div>
                {linkError && (
                  <p className="text-[12px] font-semibold text-[var(--destroy-fg)]">{linkError}</p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLinkFormOpen(false);
                      setActiveLinkSlotId(null);
                      setLinkError(null);
                    }}
                    className="h-8 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[12px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAddLink}
                    className="h-8 px-3 rounded-[8px] bg-[#FCA311] text-[#14213D] hover:bg-[var(--accent-hover)] text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <IconCheck size={14} stroke={2} />
                    <span>Gắn liên kết</span>
                  </button>
                </div>
              </div>
            )}

            {/* Attached Files & Links list */}
            {(files.length > 0 || links.length > 0) && (
              <div className="flex flex-col gap-1.5 pt-0.5">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="rounded-[8px] bg-[var(--surface-card)] border border-[var(--border)]/60 px-3 py-2 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {file.name.toLowerCase().endsWith('.pdf') ? (
                        <IconFileTypePdf
                          size={16}
                          stroke={1.75}
                          className="text-[#E34D45] shrink-0"
                        />
                      ) : (
                        <IconFile
                          size={16}
                          stroke={1.75}
                          className="text-[var(--accent-ink)] shrink-0"
                        />
                      )}
                      <span className="text-[13px] font-semibold text-[var(--text)] truncate">
                        {file.name}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                        {file.sizeLabel} · {file.source === 'resource' ? 'Tài nguyên' : 'Tải lên'}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Gỡ tệp ${file.name}`}
                      onClick={() => handleRemoveFile(file.id)}
                      className="w-7 h-7 rounded-[6px] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--destroy-bg)] hover:text-[var(--destroy-fg-hover)] shrink-0 transition-colors cursor-pointer"
                    >
                      <IconX size={14} stroke={2} />
                    </button>
                  </div>
                ))}

                {links.map((link) => (
                  <div
                    key={link.id}
                    className="rounded-[8px] bg-[var(--surface-card)] border border-[var(--border)]/60 px-3 py-2 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <IconLink
                        size={16}
                        stroke={1.75}
                        className="text-[var(--accent-ink)] shrink-0"
                      />
                      <div className="min-w-0 flex flex-col">
                        <span className="text-[13px] leading-[18px] font-semibold text-[var(--text)] truncate">
                          {link.label}
                        </span>
                        <span className="text-[11px] leading-[15px] font-mono text-[var(--text-muted)] truncate">
                          {link.url}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Gỡ liên kết ${link.label}`}
                      onClick={() => handleRemoveLink(link.id)}
                      className="w-7 h-7 rounded-[6px] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--destroy-bg)] hover:text-[var(--destroy-fg-hover)] shrink-0 transition-colors cursor-pointer"
                    >
                      <IconX size={14} stroke={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Drafted Email Body */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="reply-body-textarea"
                className="text-[13px] leading-[18px] font-semibold text-[var(--text)]"
              >
                Nội dung email (AI soạn nháp theo giải pháp đã chọn)
              </label>
              <button
                type="button"
                onClick={handleRegenerateBody}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--accent-ink)] hover:underline cursor-pointer"
              >
                <IconRefresh size={13} stroke={2} />
                <span>Soạn lại theo đính kèm</span>
              </button>
            </div>
            <textarea
              id="reply-body-textarea"
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[14px] leading-[22px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)] resize-y min-h-[150px]"
            />
          </div>

          {/* Pre-send Guardrails (non-blocking warnings & blocking errors) */}
          {links.length > 0 && hasExternalRecipient && (
            <div className="rounded-[10px] bg-[var(--warning-bg)] text-[var(--warning-fg)] px-3.5 py-2.5 flex items-start gap-2 text-[12px] leading-[18px]">
              <IconAlertTriangle
                size={16}
                stroke={2}
                className="text-[var(--warning-icon)] shrink-0 mt-0.5"
              />
              <span>
                Đang đính kèm {links.length} liên kết gửi cho đối tác/khách — hãy đảm bảo liên kết
                đã mở quyền xem cho người nhận.
              </span>
            </div>
          )}

          {formError && (
            <div className="rounded-[10px] bg-[var(--destroy-bg)] text-[var(--destroy-fg)] px-3.5 py-2.5 text-[13px] font-semibold">
              {formError}
            </div>
          )}
        </div>

        <div className="h-px w-full bg-[var(--divider)] shrink-0" />

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 shrink-0">
          <span className="text-[12px] leading-[16px] text-[var(--text-muted)] tabular-nums">
            {toEmails.length + ccEmails.length} người nhận · {files.length} tệp · {links.length}{' '}
            liên kết
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSending}
              onClick={onClose}
              className="h-9 px-4 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isSending}
              onClick={handleSubmitSend}
              className="h-9 px-5 rounded-[8px] bg-[#FCA311] text-[#14213D] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-[14px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {isSending ? (
                <IconLoader2 size={15} className="animate-spin" />
              ) : (
                <IconSend size={15} stroke={2} />
              )}
              <span>{isSending ? 'Đang gửi...' : 'Gửi email'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
