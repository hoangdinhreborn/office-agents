import { create } from 'zustand';
import {
  buildGeneratedPdfPages,
  MOCK_PDF_SAMPLE_OCR,
  resolvePdfCitationTarget,
} from '../data/mockPdfDocuments';
import {
  DEFAULT_CUSTOM_RECURRENCE,
  EXTRA_FETCHABLE_MAILBOX_LABELS,
  INITIAL_CALENDAR_EVENTS,
  INITIAL_CHAT_SESSIONS,
  INITIAL_LOCAL_LLM_CONFIG,
  INITIAL_MAILBOX_LABELS,
  INITIAL_MODEL_PROVIDERS,
  INITIAL_PROJECTS,
  LOCAL_MODELS,
  SYNCABLE_MOCK_EMAILS,
} from '../data/seedData';
import { MAIL_OVERVIEW_REPORT_ID } from '../lib/mailOverviewReport';
import type {
  CalendarEvent,
  ChatMessage,
  ChatSession,
  LocalLlmConfig,
  MailboxLabel,
  MailResource,
  MemberRole,
  ModelItem,
  ModelProviderConfig,
  PdfResource,
  PdfViewerState,
  Project,
  ProjectConfig,
  ProjectIconCode,
  ProjectMember,
  ReplyAttachmentFile,
  ReplyAttachmentLink,
  ResourceItem,
  ResourceViewMode,
  ScheduleDraft,
  SentMailRecord,
  SortMode,
  SummaryStyle,
  ThemeMode,
  ToastItem,
  ToastVariant,
  ToolbarTab,
} from '../types/workspace';
import { formatBytesVi, formatRepeatSummary } from '../utils/format';

interface WorkspaceState {
  // Navigation & shell state
  sidebarOpen: boolean;
  activeView: 'projects' | 'project-detail';
  activeProjectId: string | null;
  activeSessionId: string | null;
  rightTabOpen: boolean;
  isLoggedOut: boolean;
  themeMode: ThemeMode;

  // Project list controls
  projectSearch: string;
  projectSort: SortMode;

  // Resource panel & PDF View Mode controls
  resourceSort: SortMode;
  resourceViewMode: ResourceViewMode;
  resourceInputSubTab: 'mail' | 'pdf';
  expandedToolbarByResourceId: Record<string, ToolbarTab | null>;
  pdfViewer: PdfViewerState | null;
  isSyncingMail: boolean;
  syncCursorIndex: number;

  // Chat & Local LLM state
  selectedModelId: string;
  modelProviders: ModelProviderConfig[];
  localLlmConfig: LocalLlmConfig;
  isAgentResponding: boolean;
  regeneratingSolutionsResourceId: string | null;

  // Entities
  projects: Project[];
  mailboxLabels: MailboxLabel[];
  isFetchingMailboxLabels: boolean;
  chatSessions: ChatSession[];
  calendarEvents: CalendarEvent[];
  sentMails: SentMailRecord[];
  toasts: ToastItem[];

  // Actions — Navigation & Shell
  setSidebarOpen: (open: boolean) => void;
  openProjectsList: () => void;
  openProjectDetail: (projectId: string, openRightTab?: boolean, sessionId?: string | null) => void;
  openChatSession: (sessionId: string) => void;
  startNewChatInProject: (projectId: string) => void;
  setRightTabOpen: (open: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  logoutUser: () => void;
  signBackIn: () => void;

  // Actions — Project CRUD
  setProjectSearch: (q: string) => void;
  setProjectSort: (sort: SortMode) => void;
  createProject: (payload: {
    title: string;
    icon: ProjectIconCode;
    members: ProjectMember[];
    mailLabelId?: string;
    mailLabelName?: string;
    createNewLabel?: boolean;
  }) => Project;
  fetchMailboxLabels: () => Promise<MailboxLabel[]>;
  createMailboxLabel: (name: string) => MailboxLabel;
  renameProject: (projectId: string, newTitle: string) => void;
  changeProjectIcon: (projectId: string, icon: ProjectIconCode) => void;
  deleteProject: (projectId: string) => void;
  updateProjectConfig: (projectId: string, config: ProjectConfig, members: ProjectMember[]) => void;

  // Actions — Resource Panel
  setResourceSort: (sort: SortMode) => void;
  setResourceViewMode: (mode: ResourceViewMode) => void;
  setResourceInputSubTab: (tab: 'mail' | 'pdf') => void;
  toggleResourceSelection: (projectId: string, resourceId: string) => void;
  toggleAllResources: (projectId: string, selected: boolean) => void;
  updateMailSenderRole: (projectId: string, resourceId: string, role: MemberRole) => void;
  toggleResourceToolbar: (resourceId: string) => void;
  toggleAllResourceToolbars: (projectId: string) => void;
  setResourceToolbarTab: (resourceId: string, tab: ToolbarTab) => void;
  setResourceSummaryStyle: (projectId: string, resourceId: string, style: SummaryStyle) => void;
  openPdfViewer: (
    projectId: string,
    resourceId: string,
    options?: { page?: number; sectionId?: string; citationLabel?: string }
  ) => void;
  openMailOverviewReportPdf: (projectId: string) => void;
  closePdfViewer: () => void;
  syncProjectEmails: (projectId: string) => Promise<void>;
  uploadPdfFile: (projectId: string, file: File) => void;
  uploadSampleOcrPdf: (projectId: string) => void;

  // Actions — Solutions & Schedule
  regenerateSolutions: (
    projectId: string,
    resourceId: string,
    constraint: string
  ) => Promise<void>;
  updateScheduleDraft: (
    projectId: string,
    resourceId: string,
    patch: Partial<ScheduleDraft>
  ) => void;
  approveAndCreateSchedule: (projectId: string, resourceId: string) => { ok: boolean; error?: string };
  sendSolutionReplyMail: (payload: {
    projectId: string;
    resourceId: string;
    solutionId: string;
    toEmails: string[];
    ccEmails: string[];
    subject: string;
    body: string;
    files: ReplyAttachmentFile[];
    links: ReplyAttachmentLink[];
    saveNewEmailsToProject: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;

  // Actions — Chat & Local LLM
  setSelectedModelId: (modelId: string) => void;
  upsertModelProvider: (provider: ModelProviderConfig) => void;
  deleteModelProvider: (providerId: string) => void;
  setProviderConnectionStatus: (
    providerId: string,
    status: 'connected' | 'unconfigured' | 'error'
  ) => void;
  updateLocalLlmConfig: (patch: Partial<LocalLlmConfig>) => void;
  rollbackRlAdapter: () => void;
  sendChatMessage: (content: string) => Promise<void>;
  setMessageFeedback: (sessionId: string, messageId: string, feedback: 'up' | 'down') => void;

  // Actions — Toasts
  addToast: (variant: ToastVariant, message: string, undoLabel?: string, onUndo?: () => void) => void;
  dismissToast: (id: string) => void;
}

let idCounter = 100;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function loadInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = window.localStorage.getItem('soviec-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // ignore storage errors
  }
  return 'system';
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  sidebarOpen: true,
  activeView: 'projects',
  activeProjectId: INITIAL_PROJECTS[0].id,
  activeSessionId: null,
  rightTabOpen: true,
  isLoggedOut: false,
  themeMode: loadInitialThemeMode(),

  projectSearch: '',
  projectSort: 'date_desc',

  resourceSort: 'date_desc',
  resourceViewMode: 'default',
  resourceInputSubTab: 'mail',
  expandedToolbarByResourceId: {},
  pdfViewer: null,
  isSyncingMail: false,
  syncCursorIndex: 0,

  selectedModelId: INITIAL_MODEL_PROVIDERS[0].models[0].id,
  modelProviders: INITIAL_MODEL_PROVIDERS,
  localLlmConfig: INITIAL_LOCAL_LLM_CONFIG,
  isAgentResponding: false,
  regeneratingSolutionsResourceId: null,

  projects: INITIAL_PROJECTS,
  mailboxLabels: INITIAL_MAILBOX_LABELS,
  isFetchingMailboxLabels: false,
  chatSessions: INITIAL_CHAT_SESSIONS,
  calendarEvents: INITIAL_CALENDAR_EVENTS,
  sentMails: [],
  toasts: [],

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  openProjectsList: () =>
    set({
      activeView: 'projects',
      pdfViewer: null,
    }),

  openProjectDetail: (projectId, openRightTab = true, sessionId = null) =>
    set((state) => ({
      activeView: 'project-detail',
      activeProjectId: projectId,
      rightTabOpen: openRightTab,
      activeSessionId: sessionId,
      pdfViewer: state.pdfViewer?.projectId === projectId ? state.pdfViewer : null,
    })),

  openChatSession: (sessionId) => {
    const session = get().chatSessions.find((s) => s.id === sessionId);
    if (!session) return;
    set((state) => ({
      activeView: 'project-detail',
      activeProjectId: session.projectId,
      activeSessionId: session.id,
      rightTabOpen: true,
      pdfViewer: state.pdfViewer?.projectId === session.projectId ? state.pdfViewer : null,
    }));
  },

  startNewChatInProject: (projectId) =>
    set({
      activeView: 'project-detail',
      activeProjectId: projectId,
      activeSessionId: null,
    }),

  setRightTabOpen: (open) =>
    set((state) => ({
      rightTabOpen: open,
      pdfViewer: open ? null : state.pdfViewer,
    })),

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('soviec-theme', mode);
      } catch {
        // ignore storage errors
      }
    }
  },

  logoutUser: () => {
    set({ isLoggedOut: true });
    get().addToast('info', 'Đã đăng xuất khỏi phiên làm việc cục bộ.');
  },

  signBackIn: () => {
    set({ isLoggedOut: false });
    get().addToast('success', 'Đã khôi phục phiên làm việc của Nguyễn Minh Tuấn.');
  },

  setProjectSearch: (q) => set({ projectSearch: q }),
  setProjectSort: (sort) => set({ projectSort: sort }),

  fetchMailboxLabels: async () => {
    if (get().isFetchingMailboxLabels) return get().mailboxLabels;
    set({ isFetchingMailboxLabels: true });
    await new Promise((resolve) => setTimeout(resolve, 450));

    const current = get().mailboxLabels;
    const existingIds = new Set(current.map((l) => l.id));
    const newlyFound = EXTRA_FETCHABLE_MAILBOX_LABELS.filter((l) => !existingIds.has(l.id));
    const merged = newlyFound.length > 0 ? [...current, ...newlyFound] : current;

    set({
      mailboxLabels: merged,
      isFetchingMailboxLabels: false,
    });

    get().addToast(
      'info',
      newlyFound.length > 0
        ? `Đã tải ${merged.length} nhãn từ hộp thư (+${newlyFound.length} nhãn mới).`
        : `Đã cập nhật danh sách ${merged.length} nhãn từ hộp thư.`
    );
    return merged;
  },

  createMailboxLabel: (rawName) => {
    const cleaned = rawName.trim().replace(/\s+/g, '-').replace(/^\/+|\/+$/g, '') || 'DuAn-Moi';
    const existing = get().mailboxLabels.find(
      (l) => l.name.toLowerCase() === cleaned.toLowerCase()
    );
    if (existing) return existing;

    const created: MailboxLabel = {
      id: nextId('lbl'),
      name: cleaned,
      messageCount: 0,
      source: 'created',
    };
    set((state) => ({
      mailboxLabels: [created, ...state.mailboxLabels],
    }));
    return created;
  },

  createProject: ({ title, icon, members, mailLabelId, mailLabelName, createNewLabel }) => {
    const trimmedTitle = title.trim();
    let resolvedLabel: MailboxLabel | undefined;

    if (createNewLabel) {
      const desiredName =
        mailLabelName?.trim() || trimmedTitle.slice(0, 22).replace(/\s+/g, '-');
      resolvedLabel = get().createMailboxLabel(desiredName);
    } else if (mailLabelId) {
      resolvedLabel = get().mailboxLabels.find((l) => l.id === mailLabelId);
    }

    if (!resolvedLabel) {
      const fallbackName =
        mailLabelName?.trim() || trimmedTitle.slice(0, 22).replace(/\s+/g, '-');
      resolvedLabel = get().createMailboxLabel(fallbackName);
    }

    const newProject: Project = {
      id: nextId('proj'),
      title: trimmedTitle,
      icon,
      createdAt: new Date().toISOString(),
      members,
      resources: [],
      config: {
        imapFolder: `INBOX/${resolvedLabel.name}`,
        mailLabelId: resolvedLabel.id,
        mailLabelName: resolvedLabel.name,
        defaultSummaryStyle: 'ý chính',
        mailSyncIntervalMinutes: 60,
        defaultReminderMinutes: 30,
        collectRlFeedback: true,
      },
    };
    set((state) => ({
      projects: [newProject, ...state.projects],
    }));
    get().addToast(
      'success',
      `Đã tạo dự án "${newProject.title}" (liên kết nhãn email: ${resolvedLabel.name}).`
    );
    return newProject;
  },

  renameProject: (projectId, newTitle) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? { ...p, title: trimmed } : p)),
    }));
    get().addToast('success', `Đã đổi tên dự án thành "${trimmed}".`);
  },

  changeProjectIcon: (projectId, icon) => {
    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? { ...p, icon } : p)),
    }));
    get().addToast('success', 'Đã cập nhật nhãn dự án.');
  },

  deleteProject: (projectId) => {
    const state = get();
    const target = state.projects.find((p) => p.id === projectId);
    if (!target) return;
    const targetIndex = state.projects.findIndex((p) => p.id === projectId);
    const removedSessions = state.chatSessions.filter((s) => s.projectId === projectId);

    set((s) => ({
      projects: s.projects.filter((p) => p.id !== projectId),
      chatSessions: s.chatSessions.filter((sess) => sess.projectId !== projectId),
      activeView: s.activeProjectId === projectId ? 'projects' : s.activeView,
      activeProjectId: s.activeProjectId === projectId ? null : s.activeProjectId,
      activeSessionId:
        removedSessions.some((rs) => rs.id === s.activeSessionId) ? null : s.activeSessionId,
    }));

    get().addToast('destroy', `Đã xóa dự án "${target.title}".`, 'Hoàn tác', () => {
      set((s) => {
        const nextProjects = [...s.projects];
        nextProjects.splice(Math.min(targetIndex, nextProjects.length), 0, target);
        return {
          projects: nextProjects,
          chatSessions: [...removedSessions, ...s.chatSessions],
        };
      });
      get().addToast('success', `Đã khôi phục dự án "${target.title}".`);
    });
  },

  updateProjectConfig: (projectId, config, members) => {
    const roleByEmail = new Map(
      members.map((m) => [m.email.toLowerCase(), m.role] as const)
    );
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              config,
              members,
              resources: p.resources.map((r) => {
                if (r.type !== 'mail') return r;
                const mappedRole = roleByEmail.get(r.senderEmail.toLowerCase());
                return mappedRole ? { ...r, senderRole: mappedRole } : r;
              }),
            }
      ),
    }));
    get().addToast('success', 'Đã lưu cấu hình dự án và danh sách thành viên.');
  },

  setResourceSort: (sort) => set({ resourceSort: sort }),
  setResourceViewMode: (mode) => set({ resourceViewMode: mode }),
  setResourceInputSubTab: (tab) => set({ resourceInputSubTab: tab }),

  toggleResourceSelection: (projectId, resourceId) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              resources: p.resources.map((r) =>
                r.id === resourceId ? { ...r, selected: !r.selected } : r
              ),
            }
      ),
    }));
  },

  toggleAllResources: (projectId, selected) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              resources: p.resources.map((r) => ({ ...r, selected })),
            }
      ),
    }));
  },

  updateMailSenderRole: (projectId, resourceId, role) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              resources: p.resources.map((r) =>
                r.id === resourceId && r.type === 'mail' ? { ...r, senderRole: role } : r
              ),
            }
      ),
    }));
    get().addToast('info', `Đã chuyển phân loại người gửi sang "${role}".`);
  },

  toggleResourceToolbar: (resourceId) => {
    set((state) => {
      const current = state.expandedToolbarByResourceId[resourceId];
      return {
        expandedToolbarByResourceId: {
          ...state.expandedToolbarByResourceId,
          [resourceId]: current ? null : 'summarize',
        },
      };
    });
  },

  toggleAllResourceToolbars: (projectId) => {
    const state = get();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project || project.resources.length === 0) return;

    const anyExpanded = project.resources.some((r) =>
      Boolean(state.expandedToolbarByResourceId[r.id])
    );

    const nextMap = { ...state.expandedToolbarByResourceId };
    if (anyExpanded) {
      for (const r of project.resources) {
        nextMap[r.id] = null;
      }
      set({ expandedToolbarByResourceId: nextMap });
      get().addToast('info', 'Đã thu gọn toàn bộ thanh công cụ tài nguyên.');
    } else {
      const selectedList = project.resources.filter((r) => r.selected);
      const targets = selectedList.length > 0 ? selectedList : project.resources;
      for (const r of targets) {
        nextMap[r.id] = 'summarize';
      }
      set({ expandedToolbarByResourceId: nextMap });
      get().addToast(
        'info',
        selectedList.length > 0
          ? `Đã mở thanh công cụ cho ${targets.length} nguồn đang chọn.`
          : `Đã mở thanh công cụ cho toàn bộ ${targets.length} nguồn.`
      );
    }
  },

  setResourceToolbarTab: (resourceId, tab) => {
    set((state) => ({
      expandedToolbarByResourceId: {
        ...state.expandedToolbarByResourceId,
        [resourceId]: tab,
      },
    }));
  },

  openPdfViewer: (projectId, resourceId, options) => {
    const project = get().projects.find((p) => p.id === projectId);
    const pdf = project?.resources.find(
      (r): r is PdfResource => r.id === resourceId && r.type === 'pdf'
    );
    if (!pdf) return;

    let targetPage = options?.page ?? pdf.pages?.[0]?.pageNumber ?? 1;
    let highlightSectionId = options?.sectionId;

    if (options?.page && !highlightSectionId) {
      const resolved = resolvePdfCitationTarget(pdf, options.page);
      targetPage = resolved.pageNumber;
      highlightSectionId = resolved.sectionId;
    }

    set((state) => ({
      rightTabOpen: true,
      pdfViewer: {
        projectId,
        resourceId,
        targetPage,
        highlightSectionId,
        citationLabel: options?.citationLabel,
        focusNonce: (state.pdfViewer?.focusNonce ?? 0) + 1,
      },
    }));
  },

  openMailOverviewReportPdf: (projectId) => {
    set((state) => ({
      rightTabOpen: true,
      pdfViewer: {
        projectId,
        resourceId: MAIL_OVERVIEW_REPORT_ID,
        targetPage: 1,
        focusNonce: (state.pdfViewer?.focusNonce ?? 0) + 1,
      },
    }));
  },

  closePdfViewer: () =>
    set((state) => ({
      pdfViewer: null,
      rightTabOpen:
        state.pdfViewer?.resourceId === MAIL_OVERVIEW_REPORT_ID ? false : state.rightTabOpen,
    })),

  setResourceSummaryStyle: (projectId, resourceId, style) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              resources: p.resources.map((r) =>
                r.id === resourceId ? { ...r, activeSummaryStyle: style } : r
              ),
            }
      ),
    }));
  },

  syncProjectEmails: async (projectId) => {
    if (get().isSyncingMail) return;
    set({ isSyncingMail: true });
    await new Promise((resolve) => setTimeout(resolve, 650));

    const state = get();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) {
      set({ isSyncingMail: false });
      return;
    }

    const cursor = state.syncCursorIndex;
    if (cursor >= SYNCABLE_MOCK_EMAILS.length) {
      set({ isSyncingMail: false });
      get().addToast(
        'info',
        `Thư mục ${project.config.imapFolder} chưa có thư mới (đã bỏ qua các thư trùng lặp).`
      );
      return;
    }

    const template = SYNCABLE_MOCK_EMAILS[cursor];
    const newMail: MailResource = {
      id: nextId('res-mail'),
      type: 'mail',
      senderEmail: template.senderEmail,
      senderRole: template.senderRole,
      subject: template.subject,
      folderName: project.config.imapFolder,
      createdAt: new Date().toISOString(),
      selected: true,
      activeSummaryStyle: project.config.defaultSummaryStyle,
      summaryByStyle: {
        ngắn: template.summaryShort,
        'ý chính': template.summaryKey,
        'gạch đầu dòng': `- Người gửi: ${template.senderEmail} (${template.senderRole}).\n- Chủ đề: ${template.subject}.\n- ${template.summaryShort}`,
      },
      solutions: [
        {
          id: nextId('sol'),
          titleMarkdown: `**Phản hồi xác nhận ngay và cập nhật tiến độ vào dự án**\n\nXác nhận tiếp nhận thông tin từ \`${template.senderEmail}\` và gắn lịch theo dõi tự động.`,
          prosConsMarkdown:
            '- **Ưu điểm:** Giữ nhịp trao đổi nhanh, không bỏ sót đầu việc mới phát sinh.\n- **Nhược điểm:** Cần rà soát nhanh số liệu nội bộ trước khi gửi.',
        },
        {
          id: nextId('sol'),
          titleMarkdown:
            '**Gom vào danh mục thảo luận trong phiên họp định kỳ gần nhất**\n\nLưu trữ email vào nguồn dự án để trình bày đồng bộ cùng các tài liệu liên quan.',
          prosConsMarkdown:
            '- **Ưu điểm:** Giảm số lượng trao đổi rời rạc qua email.\n- **Nhược điểm:** Thời gian phản hồi chậm hơn 1–2 ngày.',
        },
      ],
      schedule: {
        title: template.scheduleTitle,
        date: template.scheduleDate,
        startTime: template.scheduleStart,
        endTime: template.scheduleEnd,
        allDay: false,
        repeat: 'Does not repeat',
        customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
        hasDeadline: false,
        deadlineDate: template.scheduleDate,
        description: `Trích xuất từ email "${template.subject}" (${template.senderEmail}).`,
        isApproved: false,
      },
    };

    set((s) => ({
      isSyncingMail: false,
      syncCursorIndex: s.syncCursorIndex + 1,
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, resources: [newMail, ...p.resources] } : p
      ),
    }));
    get().addToast('success', `Đã đồng bộ 1 email mới từ ${project.config.imapFolder}.`);
  },

  uploadPdfFile: (projectId, file) => {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.pdf')) {
      get().addToast('destroy', 'Định dạng không hợp lệ. Chỉ hỗ trợ tệp .PDF (UC_01).');
      return;
    }

    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;

    const estimatedPages = Math.max(2, Math.min(86, Math.round(file.size / 65000) || 6));
    const isLongPdf = estimatedPages >= 20;
    const fileUrl = URL.createObjectURL(file);

    const newPdf: PdfResource = {
      id: nextId('res-pdf'),
      type: 'pdf',
      fileName: file.name,
      fileSize: formatBytesVi(file.size),
      pageCount: estimatedPages,
      isMapReduce: isLongPdf,
      documentCode: `UPLOAD-${new Date().getFullYear()}`,
      issuedDate: '24-11-2026',
      fileUrl,
      pages: buildGeneratedPdfPages(file.name, estimatedPages),
      createdAt: new Date().toISOString(),
      selected: true,
      activeSummaryStyle: project.config.defaultSummaryStyle,
      summaryByStyle: {
        ngắn: `Đã trích xuất nội dung từ **${file.name}** (${estimatedPages} trang). Tài liệu nêu rõ phạm vi công việc, đầu mối phụ trách và mốc nghiệm thu dự kiến.`,
        'ý chính': `### Tóm tắt ${file.name}\n- **Quy mô tài liệu:** ${estimatedPages} trang (${formatBytesVi(file.size)})${isLongPdf ? ' — đã chạy tóm tắt Map-Reduce theo từng phần' : ''}.\n- **Nội dung chính:** Chuẩn hóa yêu cầu nghiệp vụ, bảng tiến độ dự kiến và các điều kiện kiểm định đầu ra [tr. 1–${Math.min(4, estimatedPages)}].\n- **Hành động tiếp theo:** Rà soát các hạng mục ưu tiên và xác nhận mốc bàn giao với các bên liên quan.`,
        'gạch đầu dòng': `- Tên tệp: ${file.name}\n- Dung lượng: ${formatBytesVi(file.size)} · ${estimatedPages} trang\n- Phương thức xử lý: ${isLongPdf ? 'Chia đoạn Map-Reduce cục bộ' : 'Trích xuất văn bản trực tiếp'}\n- Đã sẵn sàng dùng làm ngữ cảnh cho chat, đề xuất giải pháp và trích xuất lịch.`,
      },
      solutions: [
        {
          id: nextId('sol'),
          titleMarkdown: `**Rà soát nhanh các đầu mục trọng yếu của ${file.name} trước khi phân việc**\n\nTập trung xử lý 3 hạng mục có tác động lớn nhất tới tiến độ dự án.`,
          prosConsMarkdown:
            '- **Ưu điểm:** Rút ngắn thời gian đọc tài liệu, bám sát nguồn trích dẫn.\n- **Nhược điểm:** Cần kiểm tra đối chiếu số liệu chi tiết ở phần phụ lục.',
        },
        {
          id: nextId('sol'),
          titleMarkdown:
            '**Tạo danh sách đầu việc theo từng mốc và gán nhắc lịch tự động**\n\nChuyển các hạn chót trong tài liệu sang tab Đặt lịch để theo dõi định kỳ.',
          prosConsMarkdown:
            '- **Ưu điểm:** Tránh trễ hạn, dễ phối hợp giữa thành viên nội bộ và khách.\n- **Nhược điểm:** Cần xác nhận lại thời gian nếu tài liệu ghi mốc tương đối.',
        },
      ],
      schedule: {
        title: `Rà soát tài liệu ${file.name.replace(/\.pdf$/i, '')}`,
        date: '2026-11-28',
        startTime: '09:00',
        endTime: '10:00',
        allDay: false,
        repeat: 'Does not repeat',
        customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
        hasDeadline: false,
        deadlineDate: '2026-12-01',
        description: `Phiên rà soát nội dung trích xuất từ ${file.name} (${estimatedPages} trang).`,
        isApproved: false,
      },
    };

    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, resources: [newPdf, ...p.resources] } : p
      ),
      expandedToolbarByResourceId: {
        ...state.expandedToolbarByResourceId,
        [newPdf.id]: 'summarize',
      },
    }));
    get().addToast('success', `Đã tải lên và tóm tắt "${file.name}".`);
  },

  uploadSampleOcrPdf: (projectId) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;
    const newPdf: PdfResource = {
      id: nextId('res-pdf-ocr'),
      type: 'pdf',
      fileName: 'CongVan_Scan_PheDuyet_NganSach.pdf',
      fileSize: '4,6 MB',
      pageCount: 12,
      isOcr: true,
      documentCode: 'CV-NS-2026/OCR',
      issuedDate: '24-11-2026',
      pages: MOCK_PDF_SAMPLE_OCR,
      createdAt: new Date().toISOString(),
      selected: true,
      activeSummaryStyle: project.config.defaultSummaryStyle,
      summaryByStyle: {
        ngắn:
          'Bản scan đã nhận dạng OCR: Ban Giám đốc phê duyệt bổ sung **180 triệu VNĐ** cho hạng mục hạ tầng máy chủ chạy mô hình nội bộ, yêu cầu giải ngân trước **15-12-2026**.',
        'ý chính':
          '### Tóm tắt Công văn (Nhận dạng OCR cục bộ)\n- **Quyết định:** Phê duyệt ngân sách bổ sung `180 triệu VNĐ` [tr. 2].\n- **Điều kiện:** Hoàn thiện hồ sơ mua sắm thiết bị và biên bản kiểm thử bảo mật trước **15-12-2026** [tr. 8].',
        'gạch đầu dòng':
          '- Nguồn: PDF scan không có text layer (đã OCR cục bộ).\n- Ngân sách phê duyệt: 180 triệu VNĐ.\n- Hạn hoàn tất giải ngân: 15-12-2026.',
      },
      solutions: [
        {
          id: nextId('sol'),
          titleMarkdown:
            '**Lập ngay hồ sơ yêu cầu báo giá từ 3 nhà cung cấp phần cứng**\n\nKhởi động quy trình mua sắm trong tuần này để kịp kiểm thử trước 15-12.',
          prosConsMarkdown:
            '- **Ưu điểm:** Đảm bảo đúng quy trình kiểm toán nội bộ và kịp hạn giải ngân.\n- **Nhược điểm:** Thời gian giao thiết bị cần theo sát nhà cung cấp.',
        },
        {
          id: nextId('sol'),
          titleMarkdown:
            '**Chia 2 giai đoạn nâng cấp: ưu tiên RAM/GPU cho node suy luận chính**\n\nGiải ngân trước 70% để đưa vào vận hành ngay cho các dự án Q4.',
          prosConsMarkdown:
            '- **Ưu điểm:** Có hiệu quả vận hành sớm.\n- **Nhược điểm:** Phát sinh 2 đợt nghiệm thu thiết bị.',
        },
      ],
      schedule: {
        title: 'Chốt hồ sơ mua sắm thiết bị theo Công văn phê duyệt',
        date: '2026-12-01',
        startTime: '14:00',
        endTime: '15:00',
        allDay: false,
        repeat: 'Does not repeat',
        customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
        hasDeadline: true,
        deadlineDate: '2026-12-15',
        description: 'Theo dõi giải ngân 180 triệu VNĐ từ CongVan_Scan_PheDuyet_NganSach.pdf.',
        isApproved: false,
      },
    };
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, resources: [newPdf, ...p.resources] } : p
      ),
      expandedToolbarByResourceId: {
        ...state.expandedToolbarByResourceId,
        [newPdf.id]: 'summarize',
      },
    }));
    get().addToast('success', 'Đã nhận dạng OCR và tóm tắt tệp PDF scan mẫu.');
  },

  regenerateSolutions: async (projectId, resourceId, constraint) => {
    const trimmed = constraint.trim();
    set({ regeneratingSolutionsResourceId: resourceId });
    await new Promise((resolve) => setTimeout(resolve, 550));

    set((state) => ({
      regeneratingSolutionsResourceId: null,
      projects: state.projects.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              resources: p.resources.map((r) => {
                if (r.id !== resourceId) return r;
                const note = trimmed || 'tối ưu chi phí & rút gọn thời gian triển khai';
                return {
                  ...r,
                  solutions: r.solutions.map((sol, idx) =>
                    idx === 0
                      ? {
                          ...sol,
                          titleMarkdown: `**Phương án tối ưu theo ràng buộc: "${note}"**\n\nƯu tiên triển khai ngay cấu trúc công việc đáp ứng trực tiếp yêu cầu *${note}* mà vẫn bảo toàn các mốc cam kết cốt lõi của dự án.`,
                          prosConsMarkdown: `- **Ưu điểm:** Bám sát ràng buộc mới (${note}), kiểm soát rủi ro và giữ vững tiến độ chính.\n- **Nhược điểm:** Cần chốt nhanh đầu mối phê duyệt trong 24 giờ tới.`,
                          constraintHistory: [...(sol.constraintHistory ?? []), note],
                        }
                      : {
                          ...sol,
                          titleMarkdown: `**Phương án dự phòng linh hoạt theo ràng buộc: "${note}"**\n\nPhân kỳ phạm vi theo 2 chặng nhỏ để giảm áp lực nguồn lực khi áp dụng ràng buộc *${note}*.`,
                          prosConsMarkdown: `- **Ưu điểm:** Dễ điều chỉnh giữa chừng, ít gây xung đột với lịch hiện có.\n- **Nhược điểm:** Tổng thời gian hoàn tất có thể kéo dài thêm 2–3 ngày làm việc.`,
                          constraintHistory: [...(sol.constraintHistory ?? []), note],
                        }
                  ),
                };
              }),
            }
      ),
    }));
    get().addToast(
      'success',
      trimmed
        ? `Đã đề xuất lại toàn bộ phương án theo ràng buộc "${trimmed}".`
        : 'Đã tạo lại toàn bộ phương án đề xuất mới.'
    );
  },

  updateScheduleDraft: (projectId, resourceId, patch) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              resources: p.resources.map((r) =>
                r.id === resourceId
                  ? { ...r, schedule: { ...r.schedule, ...patch, isApproved: false } }
                  : r
              ),
            }
      ),
    }));
  },

  approveAndCreateSchedule: (projectId, resourceId) => {
    const state = get();
    const project = state.projects.find((p) => p.id === projectId);
    const resource = project?.resources.find((r) => r.id === resourceId);
    if (!project || !resource) return { ok: false, error: 'Không tìm thấy nguồn dữ liệu.' };

    const draft = resource.schedule;
    if (!draft.title.trim()) {
      return { ok: false, error: 'Vui lòng nhập tiêu đề lịch trước khi duyệt.' };
    }
    if (!draft.date) {
      return { ok: false, error: 'Thiếu ngày diễn ra sự kiện. Vui lòng chọn ngày.' };
    }
    if (!draft.allDay && (!draft.startTime || !draft.endTime || draft.endTime <= draft.startTime)) {
      return { ok: false, error: 'Giờ kết thúc cần lớn hơn giờ bắt đầu.' };
    }

    const newEvent: CalendarEvent = {
      id: nextId('evt'),
      projectId,
      resourceId,
      title: draft.title.trim(),
      date: draft.date,
      startTime: draft.allDay ? '00:00' : draft.startTime,
      endTime: draft.allDay ? '23:59' : draft.endTime,
      allDay: draft.allDay,
      repeatSummary: formatRepeatSummary(draft.repeat, draft.customRepeat),
      deadlineDate: draft.hasDeadline ? draft.deadlineDate : undefined,
      description: draft.description,
      reminderMinutes: project.config.defaultReminderMinutes,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      calendarEvents: [newEvent, ...s.calendarEvents],
      projects: s.projects.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              resources: p.resources.map((r) =>
                r.id === resourceId
                  ? {
                      ...r,
                      schedule: {
                        ...r.schedule,
                        isApproved: true,
                        approvedEventId: newEvent.id,
                      },
                    }
                  : r
              ),
            }
      ),
    }));

    get().addToast(
      'success',
      `Đã tạo lịch "${newEvent.title}" (nhắc trước ${newEvent.reminderMinutes} phút).`,
      'Hoàn tác',
      () => {
        set((s) => ({
          calendarEvents: s.calendarEvents.filter((e) => e.id !== newEvent.id),
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  resources: p.resources.map((r) =>
                    r.id === resourceId
                      ? {
                          ...r,
                          schedule: {
                            ...r.schedule,
                            isApproved: false,
                            approvedEventId: undefined,
                          },
                        }
                      : r
                  ),
                }
          ),
        }));
        get().addToast('info', `Đã hủy lịch "${newEvent.title}".`);
      }
    );

    return { ok: true };
  },

  sendSolutionReplyMail: async (payload) => {
    const cleanTo = Array.from(
      new Set(payload.toEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))
    );
    const cleanCc = Array.from(
      new Set(
        payload.ccEmails
          .map((e) => e.trim().toLowerCase())
          .filter((e) => Boolean(e) && !cleanTo.includes(e))
      )
    );

    if (cleanTo.length === 0) {
      return { ok: false, error: 'Vui lòng chọn hoặc nhập ít nhất 1 địa chỉ email người nhận.' };
    }
    if (!payload.subject.trim()) {
      return { ok: false, error: 'Vui lòng nhập tiêu đề email.' };
    }
    if (!payload.body.trim()) {
      return { ok: false, error: 'Vui lòng nhập nội dung phản hồi.' };
    }

    await new Promise((resolve) => setTimeout(resolve, 420));

    const now = new Date().toISOString();
    const record: SentMailRecord = {
      id: nextId('sent-mail'),
      projectId: payload.projectId,
      resourceId: payload.resourceId,
      solutionId: payload.solutionId,
      toEmails: cleanTo,
      ccEmails: cleanCc,
      subject: payload.subject.trim(),
      body: payload.body.trim(),
      files: payload.files,
      links: payload.links,
      sentAt: now,
    };

    let addedMemberCount = 0;

    set((state) => ({
      sentMails: [record, ...state.sentMails],
      projects: state.projects.map((p) => {
        if (p.id !== payload.projectId) return p;

        let nextMembers = p.members;
        if (payload.saveNewEmailsToProject) {
          const existingSet = new Set(p.members.map((m) => m.email.toLowerCase()));
          const allRecipients = [...cleanTo, ...cleanCc];
          const additions: ProjectMember[] = [];
          for (const email of allRecipients) {
            if (!existingSet.has(email)) {
              existingSet.add(email);
              additions.push({
                id: nextId('m-reply'),
                email,
                role: email.endsWith('@soviectech.vn') ? 'nội bộ' : 'khách',
              });
            }
          }
          if (additions.length > 0) {
            addedMemberCount = additions.length;
            nextMembers = [...additions, ...p.members];
          }
        }

        return {
          ...p,
          members: nextMembers,
          resources: p.resources.map((r) =>
            r.id === payload.resourceId
              ? {
                  ...r,
                  selectedSolutionId: payload.solutionId,
                  repliedAt: now,
                }
              : r
          ),
        };
      }),
    }));

    const attachSummaryParts: string[] = [];
    if (payload.files.length > 0) attachSummaryParts.push(`${payload.files.length} tệp`);
    if (payload.links.length > 0) attachSummaryParts.push(`${payload.links.length} liên kết`);
    const attachSuffix =
      attachSummaryParts.length > 0 ? ` (${attachSummaryParts.join(', ')})` : '';
    const savedSuffix =
      addedMemberCount > 0 ? ` · đã lưu ${addedMemberCount} email mới vào dự án` : '';

    get().addToast(
      'success',
      `Đã gửi email tới ${cleanTo.length + cleanCc.length} người nhận${attachSuffix}${savedSuffix}.`
    );

    return { ok: true };
  },

  setSelectedModelId: (modelId) => {
    const allModels: ModelItem[] = get().modelProviders.flatMap((p) => p.models);
    const model =
      allModels.find((m) => m.id === modelId) ?? LOCAL_MODELS.find((m) => m.id === modelId);
    set({ selectedModelId: modelId });
    if (model) {
      get().addToast('info', `Đang dùng mô hình ${model.name} (${model.provider}).`);
    }
  },

  upsertModelProvider: (provider) => {
    const normalizedModels: ModelItem[] = provider.models
      .filter((m) => (m.modelId?.trim() || m.name.trim()).length > 0)
      .map((m) => ({
        ...m,
        provider: provider.displayName,
        providerId: provider.id,
        modelId: m.modelId?.trim() || m.name.trim(),
        name: m.name.trim() || m.modelId?.trim() || 'Unnamed model',
        contextWindow: m.contextWindow.trim() || '128K',
        maxOutputTokens: m.maxOutputTokens?.trim() || '16K',
        quantization: m.quantization.trim() || 'API',
      }));

    const nextProvider: ModelProviderConfig = {
      ...provider,
      models: normalizedModels,
    };

    const exists = get().modelProviders.some((p) => p.id === nextProvider.id);
    set((state) => {
      const nextProviders = exists
        ? state.modelProviders.map((p) => (p.id === nextProvider.id ? nextProvider : p))
        : [...state.modelProviders, nextProvider];

      const allModels = nextProviders.flatMap((p) => p.models);
      const stillHasSelected = allModels.some((m) => m.id === state.selectedModelId);

      return {
        modelProviders: nextProviders,
        selectedModelId: stillHasSelected
          ? state.selectedModelId
          : (allModels[0]?.id ?? state.selectedModelId),
        localLlmConfig: nextProvider.isLocalRuntime
          ? { ...state.localLlmConfig, endpointUrl: nextProvider.baseUrl }
          : state.localLlmConfig,
      };
    });

    get().addToast(
      'success',
      exists
        ? `Đã cập nhật nhà cung cấp "${nextProvider.displayName}" (${normalizedModels.length} mô hình).`
        : `Đã thêm nhà cung cấp "${nextProvider.displayName}" (${normalizedModels.length} mô hình).`
    );
  },

  deleteModelProvider: (providerId) => {
    const target = get().modelProviders.find((p) => p.id === providerId);
    if (!target) return;
    set((state) => {
      const nextProviders = state.modelProviders.filter((p) => p.id !== providerId);
      const allModels = nextProviders.flatMap((p) => p.models);
      const stillHasSelected = allModels.some((m) => m.id === state.selectedModelId);
      return {
        modelProviders: nextProviders,
        selectedModelId: stillHasSelected
          ? state.selectedModelId
          : (allModels[0]?.id ?? LOCAL_MODELS[0].id),
      };
    });
    get().addToast('info', `Đã xóa nhà cung cấp "${target.displayName}".`);
  },

  setProviderConnectionStatus: (providerId, status) => {
    set((state) => ({
      modelProviders: state.modelProviders.map((p) =>
        p.id === providerId ? { ...p, connectionStatus: status } : p
      ),
    }));
  },

  updateLocalLlmConfig: (patch) => {
    set((state) => ({
      localLlmConfig: { ...state.localLlmConfig, ...patch },
    }));
    get().addToast('success', 'Đã lưu thiết lập Local LLM.');
  },

  rollbackRlAdapter: () => {
    set((state) => ({
      localLlmConfig: {
        ...state.localLlmConfig,
        activeAdapterVersion: state.localLlmConfig.previousAdapterVersion,
        previousAdapterVersion: state.localLlmConfig.activeAdapterVersion,
      },
    }));
    get().addToast('warning', 'Đã khôi phục phiên bản adapter RL ổn định trước đó.');
  },

  sendChatMessage: async (content) => {
    const trimmed = content.trim();
    if (!trimmed || get().isAgentResponding) return;

    const state = get();
    const project = state.projects.find((p) => p.id === state.activeProjectId);
    if (!project) return;

    const selectedResources: ResourceItem[] = project.resources.filter((r) => r.selected);
    const allModels = state.modelProviders.flatMap((p) => p.models);
    const activeModel =
      allModels.find((m) => m.id === state.selectedModelId) ??
      allModels[0] ??
      LOCAL_MODELS[0];

    const userMsg: ChatMessage = {
      id: nextId('msg-u'),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    let sessionId = state.activeSessionId;
    if (!sessionId) {
      const newSession: ChatSession = {
        id: nextId('sess'),
        projectId: project.id,
        title: trimmed.length > 36 ? `${trimmed.slice(0, 36)}...` : trimmed,
        updatedAt: new Date().toISOString(),
        messages: [userMsg],
      };
      sessionId = newSession.id;
      set((s) => ({
        chatSessions: [newSession, ...s.chatSessions],
        activeSessionId: newSession.id,
        isAgentResponding: true,
      }));
    } else {
      set((s) => ({
        isAgentResponding: true,
        chatSessions: s.chatSessions.map((sess) =>
          sess.id === sessionId
            ? {
                ...sess,
                updatedAt: new Date().toISOString(),
                messages: [...sess.messages, userMsg],
              }
            : sess
        ),
      }));
    }

    await new Promise((resolve) => setTimeout(resolve, 650));

    const sourceNames = selectedResources.map((r) =>
      r.type === 'pdf' ? r.fileName : r.subject
    );

    const lower = trimmed.toLowerCase();
    let replyMarkdown = '';
    if (selectedResources.length === 0) {
      replyMarkdown = `Hiện chưa có tài liệu hay email nào được tick chọn ở bảng **Tài nguyên** của dự án **${project.title}**.\n\nBạn có thể tích chọn ít nhất 1 nguồn PDF hoặc Email ở bên phải để tôi trích xuất số liệu chính xác, hoặc cho tôi biết thêm bối cảnh cụ thể cho yêu cầu *"${trimmed}"*.`;
    } else if (lower.includes('lịch') || lower.includes('họp') || lower.includes('nhắc')) {
      const first = selectedResources[0];
      replyMarkdown = `Dựa trên **${sourceNames.length} nguồn đang chọn**, tôi đề xuất lịch làm việc sau:\n\n- **Tiêu đề:** ${first.schedule.title}\n- **Thời gian:** \`${first.schedule.date}\` · \`${first.schedule.startTime} – ${first.schedule.endTime}\`\n- **Nhắc trước:** ${project.config.defaultReminderMinutes} phút\n\nBạn có thể mở biểu tượng thanh công cụ của nguồn tương ứng ở cột **Tài nguyên** → tab **Đặt lịch** để chỉnh sửa và nhấn **Duyệt và tạo lịch**.`;
    } else if (lower.includes('giải pháp') || lower.includes('đề xuất') || lower.includes('phương án')) {
      const first = selectedResources[0];
      const topSol = first.solutions[0];
      replyMarkdown = `Từ **${sourceNames.join(', ')}**, phương án tối ưu được khuyến nghị là:\n\n${topSol.titleMarkdown}\n\n${topSol.prosConsMarkdown}\n\nMở tab **Đề xuất giải pháp** ở khung Tài nguyên nếu bạn muốn thêm ràng buộc mới để tinh chỉnh lại từng phương án.`;
    } else {
      const snippets = selectedResources
        .slice(0, 2)
        .map((r) => {
          const title = r.type === 'pdf' ? r.fileName : r.subject;
          const firstCitePage =
            r.type === 'pdf' && r.pages && r.pages.length > 0
              ? ` [tr. ${r.pages[Math.min(1, r.pages.length - 1)].pageNumber}]`
              : '';
          return `- **${title}:** ${r.summaryByStyle.ngắn}${firstCitePage}`;
        })
        .join('\n');
      replyMarkdown = `Tổng hợp nhanh cho yêu cầu của bạn trên **${sourceNames.length} nguồn đã chọn** thuộc dự án **${project.title}**:\n\n${snippets}\n\nNhấn trực tiếp vào phần trích dẫn trang để mở chế độ xem PDF và định vị ngay đoạn liên quan, hoặc mở thanh công cụ trên từng nguồn bên phải.`;
    }

    const agentMsg: ChatMessage = {
      id: nextId('msg-a'),
      role: 'agent',
      reasoning: `1. Nạp ${selectedResources.length} nguồn được chọn trong dự án "${project.title}" qua ngữ cảnh cục bộ (${activeModel.name}).\n2. Kiểm tra tính nhất quán giữa dữ kiện tài liệu và ràng buộc lịch hiện có (${get().calendarEvents.length} sự kiện).\n3. Tổng hợp câu trả lời súc tích kèm tham chiếu nguồn.`,
      reasoningDurationSec: 1.2,
      content: replyMarkdown,
      timestamp: new Date().toISOString(),
      referencedSourceNames: sourceNames,
      feedback: null,
    };

    const finalSessionId = sessionId;
    set((s) => ({
      isAgentResponding: false,
      chatSessions: s.chatSessions.map((sess) =>
        sess.id === finalSessionId
          ? {
              ...sess,
              updatedAt: new Date().toISOString(),
              messages: [...sess.messages, agentMsg],
            }
          : sess
      ),
    }));
  },

  setMessageFeedback: (sessionId, messageId, feedback) => {
    set((state) => ({
      chatSessions: state.chatSessions.map((sess) =>
        sess.id !== sessionId
          ? sess
          : {
              ...sess,
              messages: sess.messages.map((m) =>
                m.id === messageId
                  ? { ...m, feedback: m.feedback === feedback ? null : feedback }
                  : m
              ),
            }
      ),
    }));
    get().addToast(
      'info',
      feedback === 'up'
        ? 'Đã ghi nhận đánh giá tích cực làm tín hiệu cải thiện mô hình cục bộ.'
        : 'Đã ghi nhận phản hồi để cải thiện chất lượng câu trả lời.'
    );
  },

  addToast: (variant, message, undoLabel, onUndo) => {
    const id = nextId('toast');
    set((state) => ({
      toasts: [...state.toasts.slice(-2), { id, variant, message, undoLabel, onUndo }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, undoLabel ? 6500 : 3800);
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
