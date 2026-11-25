import * as llmApi from '../lib/llm-api';
import * as workspaceApi from '../lib/workspace-api';
import { create } from 'zustand';
import {
  resolvePdfCitationTarget,
} from '../data/mockPdfDocuments';
import { MAIL_OVERVIEW_REPORT_ID } from '../lib/mailOverviewReport';
import type {
  CalendarEvent,
  ChatSession,
  LocalLlmConfig,
  MailboxLabel,
  MemberRole,
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
import { formatRepeatSummary } from '../utils/format';

interface WorkspaceState {
  isLoadingProjects: boolean;
  workspaceLoaded: boolean;
  workspaceError: string | null;
  currentUser: { name: string; email: string; role: string; avatarUrl: string };
  initializeWorkspace: () => Promise<void>;

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
  }) => Promise<Project | null>;
  fetchMailboxLabels: () => Promise<MailboxLabel[]>;
  createMailboxLabel: (name: string) => Promise<MailboxLabel | null>;
  renameProject: (projectId: string, newTitle: string) => Promise<boolean>;
  changeProjectIcon: (projectId: string, icon: ProjectIconCode) => void;
  deleteProject: (projectId: string) => void;
  updateProjectConfig: (projectId: string, config: ProjectConfig, members: ProjectMember[]) => Promise<boolean>;

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
  upsertModelProvider: (provider: ModelProviderConfig) => Promise<boolean>;
  deleteModelProvider: (providerId: string) => void;
  setProviderConnectionStatus: (
    providerId: string,
    status: 'connected' | 'unconfigured' | 'error'
  ) => void;
  updateLocalLlmConfig: (patch: Partial<LocalLlmConfig>) => void;
  rollbackRlAdapter: () => void;
  sendChatMessage: (content: string) => Promise<boolean>;
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

function loadLocalLogout(): boolean {
  try { return window.sessionStorage.getItem('soviec-logged-out') === 'true'; } catch { return false; }
}
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể kết nối backend.';
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  isLoadingProjects: false,
  workspaceLoaded: false,
  workspaceError: null,
  currentUser: { name: 'Chủ máy', email: '', role: 'Chủ máy', avatarUrl: '' },
  initializeWorkspace: async () => {
    if (get().isLoadingProjects) return;
    set({ isLoadingProjects: true, workspaceError: null });
    try {
      const [projects, providerSettings] = await Promise.all([workspaceApi.listProjects(), llmApi.loadProviderSettings()]);
      set(providerSettings);
      const loaded = await Promise.all(projects.map(async (project) => ({
        project: { ...project, resources: await workspaceApi.loadResources(project.id) },
        sessions: await workspaceApi.loadSessions(project.id),
      })));
      set({ projects: loaded.map((p) => p.project), chatSessions: loaded.flatMap((p) => p.sessions),
        workspaceLoaded: true, isLoadingProjects: false,
        mailboxLabels: projects.flatMap((p) => p.config.mailLabelId ? [{ id: p.config.mailLabelId, name: p.config.mailLabelName || '', source: 'gmail' as const }] : []),
      });
      const account = await workspaceApi.loadAccount().catch(() => null);
      if (account) set({ currentUser: account });
      const email = await workspaceApi.loadGmailEmail().catch(() => null);
      if (email) set((state) => ({ currentUser: { ...state.currentUser, email } }));
    } catch (error) {
      set({ isLoadingProjects: false, workspaceError: describeError(error) });
    }
  },
  sidebarOpen: true,
  activeView: 'projects',
  activeProjectId: null,
  activeSessionId: null,
  rightTabOpen: true,
  isLoggedOut: loadLocalLogout(),
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

  selectedModelId: '',
  modelProviders: [],
  localLlmConfig: { endpointUrl: '', activeAdapterVersion: 'Chưa có adapter', previousAdapterVersion: '', quantizationFallback: '' },
  isAgentResponding: false,
  regeneratingSolutionsResourceId: null,

  projects: [],
  mailboxLabels: [],
  isFetchingMailboxLabels: false,
  chatSessions: [],
  calendarEvents: [],
  sentMails: [],
  toasts: [],

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  openProjectsList: () =>
    set({
      activeView: 'projects',
      pdfViewer: null,
    }),

  openProjectDetail: (projectId, openRightTab = true, sessionId = null) => {
    if (!get().projects.some((p) => p.id === projectId)) return;
    if (sessionId && !get().chatSessions.some((s) => s.id === sessionId && s.projectId === projectId)) return;
    set((state) => ({
      activeView: 'project-detail',
      activeProjectId: projectId,
      rightTabOpen: openRightTab,
      activeSessionId: sessionId,
      pdfViewer: state.pdfViewer?.projectId === projectId ? state.pdfViewer : null,
    }));
  },

  openChatSession: (sessionId) => {
    const session = get().chatSessions.find((s) => s.id === sessionId);
    if (!session || !get().projects.some((p) => p.id === session.projectId)) return;
    set((state) => ({
      activeView: 'project-detail',
      activeProjectId: session.projectId,
      activeSessionId: session.id,
      rightTabOpen: true,
      pdfViewer: state.pdfViewer?.projectId === session.projectId ? state.pdfViewer : null,
    }));
  },

  startNewChatInProject: async (projectId) => {
    if (!get().projects.some((p) => p.id === projectId)) return;
    set({ activeView: 'project-detail', activeProjectId: projectId, activeSessionId: null });
    try {
      const session = await workspaceApi.createSession(projectId);
      set((state) => state.projects.some((p) => p.id === projectId) ? ({ chatSessions: [session, ...state.chatSessions],
        activeSessionId: state.activeProjectId === projectId ? session.id : state.activeSessionId }) : state);
    } catch (error) { get().addToast('warning', describeError(error)); }
  },

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
    try { window.sessionStorage.setItem('soviec-logged-out', 'true'); } catch { /* Local UI preference only. */ }
    get().addToast('info', 'Đã đăng xuất khỏi phiên làm việc cục bộ.');
  },

  signBackIn: () => {
    set({ isLoggedOut: false });
    try { window.sessionStorage.removeItem('soviec-logged-out'); } catch { /* Local UI preference only. */ }
    get().addToast('success', `Đã khôi phục phiên làm việc của ${get().currentUser.name}.`);
  },

  setProjectSearch: (q) => set({ projectSearch: q }),
  setProjectSort: (sort) => set({ projectSort: sort }),

  fetchMailboxLabels: async () => {
    if (get().isFetchingMailboxLabels) return get().mailboxLabels;
    set({ isFetchingMailboxLabels: true });
    try {
      const labels = await workspaceApi.listMailboxLabels();
      set({ mailboxLabels: labels });
      return labels;
    } catch (error) {
      get().addToast('warning', describeError(error));
      return [];
    } finally { set({ isFetchingMailboxLabels: false }); }
  },

  createMailboxLabel: async (name) => {
    try {
      const label = await workspaceApi.createMailboxLabelRecord(name.trim());
      set((state) => ({ mailboxLabels: [label, ...state.mailboxLabels.filter((l) => l.id !== label.id)] }));
      return label;
    } catch (error) { get().addToast('warning', describeError(error)); return null; }
  },

  createProject: async ({ title, icon, members, mailLabelId, mailLabelName, createNewLabel }) => {
    try {
      const label = createNewLabel ? await get().createMailboxLabel(mailLabelName || title)
        : get().mailboxLabels.find((l) => l.id === mailLabelId);
      if (!label) return null;
      const project = await workspaceApi.createProjectRecord({ title, icon, members, config: {
        imapFolder: label.name, mailLabelId: label.id, mailLabelName: label.name,
        mailSyncIntervalMinutes: 60, defaultReminderMinutes: 30, collectRlFeedback: true,
      } });
      set((state) => ({ projects: [project, ...state.projects] }));
      get().addToast('success', `Đã lưu dự án "${project.title}".`);
      return project;
    } catch (error) { get().addToast('warning', describeError(error)); return null; }
  },

  renameProject: async (projectId, newTitle) => {
    try {
      const updated = await workspaceApi.updateProjectRecord(projectId, { title: newTitle });
      set((state) => ({ projects: state.projects.map((p) => p.id === projectId ? { ...p, title: updated.title } : p) }));
      get().addToast('success', `Đã đổi tên dự án thành "${updated.title}".`);
      return true;
    } catch (error) { get().addToast('warning', describeError(error)); return false; }
  },

  changeProjectIcon: async (projectId, icon) => {
    try {
      const updated = await workspaceApi.updateProjectRecord(projectId, { icon });
      set((state) => ({ projects: state.projects.map((p) => p.id === projectId ? { ...p, icon: updated.icon } : p) }));
      get().addToast('success', 'Đã lưu nhãn biểu tượng dự án.');
    } catch (error) { get().addToast('warning', describeError(error)); }
  },

  deleteProject: async (projectId) => {
    const target = get().projects.find((p) => p.id === projectId);
    if (!target) return;
    try {
      await workspaceApi.deleteProjectRecord(projectId);
      set((state) => ({ projects: state.projects.filter((p) => p.id !== projectId),
        chatSessions: state.chatSessions.filter((s) => s.projectId !== projectId),
        activeView: state.activeProjectId === projectId ? 'projects' : state.activeView,
        activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId,
        activeSessionId: state.activeProjectId === projectId ? null : state.activeSessionId,
        pdfViewer: state.pdfViewer?.projectId === projectId ? null : state.pdfViewer,
        calendarEvents: state.calendarEvents.filter((e) => e.projectId !== projectId),
        sentMails: state.sentMails.filter((m) => m.projectId !== projectId),
      }));
      get().addToast('destroy', `Đã xóa dự án "${target.title}".`, 'Hoàn tác', async () => {
        try {
          await workspaceApi.restoreProjectRecord(projectId);
          await get().initializeWorkspace();
          get().addToast('success', `Đã khôi phục dự án "${target.title}".`);
        } catch (error) { get().addToast('warning', describeError(error)); }
      });
    } catch (error) { get().addToast('warning', describeError(error)); }
  },

  updateProjectConfig: async (projectId, config, members) => {
    try {
      const updated = await workspaceApi.updateProjectRecord(projectId, { config, members });
      const roles = new Map(updated.members.map((m) => [m.email, m.role]));
      set((state) => ({ projects: state.projects.map((p) => p.id !== projectId ? p : { ...p, config: updated.config,
        members: updated.members, resources: p.resources.map((r) => r.type === 'mail'
          ? { ...r, senderRole: roles.get(r.senderEmail.toLowerCase()) || 'khách' } : r) }) }));
      get().addToast('success', 'Đã lưu cấu hình dự án và thành viên.');
      return true;
    } catch (error) { get().addToast('warning', describeError(error)); return false; }
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

  syncProjectEmails: async () => {
    get().addToast('info', 'Đồng bộ Gmail theo dự án sẽ được nối ở phần Nghiệp vụ Email; chưa có thư mới được nhập.');
  },

  uploadPdfFile: async (projectId, file) => {
    try {
      await workspaceApi.uploadProjectPdf(projectId, file);
      const resources = await workspaceApi.loadResources(projectId);
      set((state) => ({ projects: state.projects.map((p) => p.id === projectId ? { ...p, resources } : p) }));
      get().addToast('success', `Đã lưu ${file.name} vào dự án.`);
    } catch (error) { get().addToast('warning', describeError(error)); }
  },

  uploadSampleOcrPdf: () => {
    get().addToast('info', 'Hãy tải file PDF scan thật để kiểm tra OCR; không tạo tài liệu mẫu giả lập.');
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

  setSelectedModelId: async (modelId) => {
    try {
      set(await llmApi.selectModel(modelId));
      get().addToast('info', 'Đã lưu lựa chọn model.');
    } catch (error) { get().addToast('warning', describeError(error)); }
  },

  upsertModelProvider: async (provider) => {
    try {
      set(await llmApi.saveProvider(provider));
      get().addToast('success', `Đã lưu provider "${provider.displayName}". Chưa gọi thử model.`);
      return true;
    } catch (error) { get().addToast('warning', describeError(error)); return false; }
  },

  deleteModelProvider: async (providerId) => {
    try {
      set(await llmApi.removeProvider(providerId));
      get().addToast('info', 'Đã xóa provider. Nếu model đang dùng bị xóa, hãy chọn model khác.');
    } catch (error) { get().addToast('warning', describeError(error)); }
  },

  setProviderConnectionStatus: (providerId, status) => {
    set((state) => ({
      modelProviders: state.modelProviders.map((p) =>
        p.id === providerId ? { ...p, connectionStatus: status } : p
      ),
    }));
  },

  updateLocalLlmConfig: async (patch) => {
    if (patch.quantizationFallback === undefined) return;
    try {
      set(await llmApi.selectFallback(patch.quantizationFallback));
      get().addToast('success', 'Đã lưu model dự phòng VRAM. Chỉ áp dụng cho lỗi thiếu bộ nhớ trên máy chủ cục bộ.');
    } catch (error) { get().addToast('warning', describeError(error)); }
  },

  rollbackRlAdapter: () => {
    get().addToast('info', 'Chưa có adapter RL được triển khai để rollback.');
  },

  sendChatMessage: async (content) => {
    const text = content.trim();
    const state = get();
    if (!text || state.isAgentResponding || state.isLoggedOut) return false;
    const project = state.projects.find((p) => p.id === state.activeProjectId);
    if (!project) return false;
    if (!state.selectedModelId) { get().addToast('warning', 'Hãy lưu provider và chọn model trước khi chat.'); return false; }
    const session = state.chatSessions.find((s) => s.id === state.activeSessionId && s.projectId === project.id);
    set({ isAgentResponding: true });
    let posted = false;
    try {
      await workspaceApi.postChatMessage(project.id, session?.id || null, text, project.resources.filter((r) => r.selected).map((r) => r.id), state.selectedModelId);
      posted = true;
      const sessions = await workspaceApi.loadSessions(project.id);
      set((current) => current.projects.some((p) => p.id === project.id) ? ({ chatSessions: [...current.chatSessions.filter((s) => s.projectId !== project.id), ...sessions],
        activeSessionId: current.activeProjectId === project.id && !current.isLoggedOut
          ? session?.id || sessions[0]?.id || null : current.activeSessionId }) : current);
      return true;
    } catch (error) {
      get().addToast('warning', posted ? 'Câu trả lời đã lưu ở BE nhưng chưa tải lại lịch sử. Hãy mở lại dự án; không cần gửi lại câu hỏi.' : describeError(error));
      return posted;
    }
    finally { set({ isAgentResponding: false }); }
  },

  setMessageFeedback: async (sessionId, messageId, feedback) => {
    const session = get().chatSessions.find((s) => s.id === sessionId);
    const project = get().projects.find((p) => p.id === session?.projectId);
    const index = session?.messages.findIndex((m) => m.id === messageId) ?? -1;
    if (!session || !project?.config.collectRlFeedback || index < 0) return;
    const message = session.messages[index];
    try {
      await workspaceApi.postFeedback(project.id, session.messages[index - 1]?.content || '', message.content, feedback);
      set((state) => ({ chatSessions: state.chatSessions.map((s) => s.id === sessionId
        ? { ...s, messages: s.messages.map((m) => m.id === messageId ? { ...m, feedback } : m) } : s) }));
      get().addToast('info', 'Đã lưu phản hồi vào dự án.');
    } catch (error) { get().addToast('warning', describeError(error)); }
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
