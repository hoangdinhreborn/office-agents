import * as llmApi from '../lib/llm-api';
import * as emailReplyApi from '../lib/email-reply-api';
import { ApiError } from '../lib/api-client';
import * as calendarApi from '../lib/calendar-api';
import * as workspaceApi from '../lib/workspace-api';
import { streamChat } from '../lib/chat-stream';
import { create } from 'zustand';
import {
  resolvePdfCitationTarget,
} from '../data/mockPdfDocuments';
import { MAIL_OVERVIEW_REPORT_ID } from '../lib/mailOverviewReport';
import type {
  CalendarEvent,
  ChatMessage,
  ChatSession,
  LocalLlmConfig,
  MailboxLabel,
  ModelProviderConfig,
  PdfViewerState,
  Project,
  ProjectConfig,
  ProjectIconCode,
  ProjectMember,
  ReplyAttachmentFile,
  ReplyAttachmentLink,
  ResourceItem,
  ResourceViewMode,
  SentMailRecord,
  SortMode,
  MailUrgency,
  PendingMailRoute,
  ThemeMode,
  ToastItem,
  ToastVariant,
  ToolbarTab,
} from '../types/workspace';

interface WorkspaceState {
  isLoadingProjects: boolean;
  workspaceLoaded: boolean;
  workspaceError: string | null;
  currentUser: { name: string; email: string; role: string; avatarUrl: string };
  initializeWorkspace: () => Promise<void>;
  refreshCalendarData: (projectId: string) => Promise<void>;

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
  syncingMailProjectIds: string[];
  pendingMailRoutes: Record<string, PendingMailRoute[]>;
  uploadingPdfProjectId: string | null;

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
  deleteProject: (projectId: string) => Promise<boolean>;
  deleteChatSession: (sessionId: string) => Promise<boolean>;
  updateProjectConfig: (projectId: string, config: ProjectConfig, members: ProjectMember[]) => Promise<boolean>;

  // Actions — Resource Panel
  setResourceSort: (sort: SortMode) => void;
  setResourceViewMode: (mode: ResourceViewMode) => void;
  setResourceInputSubTab: (tab: 'mail' | 'pdf') => void;
  toggleResourceSelection: (projectId: string, resourceId: string) => void;
  toggleAllResources: (projectId: string, selected: boolean) => void;
  toggleResourceToolbar: (resourceId: string) => void;
  toggleAllResourceToolbars: (projectId: string) => void;
  setResourceToolbarTab: (resourceId: string, tab: ToolbarTab) => void;
  openPdfViewer: (
    projectId: string,
    resourceId: string,
    options?: { page?: number; sectionId?: string; citationLabel?: string; citationQuote?: string }
  ) => void;
  openMailOverviewReportPdf: (projectId: string) => void;
  closePdfViewer: () => void;
  syncProjectEmails: (projectId: string, resumeOnly?: boolean) => Promise<void>;
  routeMailToProject: (projectId: string, messageId: string) => Promise<void>;
  updateMailUrgency: (projectId: string, resourceId: string, urgency: MailUrgency) => Promise<void>;
  retryEmailAnalysis: (projectId: string, resourceId: string) => Promise<void>;
  uploadPdfFile: (projectId: string, file: File) => Promise<void>;

  // Actions — Solutions & Schedule
  regenerateSolutions: (
    projectId: string,
    resourceId: string,
    constraint: string
  ) => Promise<boolean>;
  sendSolutionReplyMail: (payload: {
    requestId: string;
    pendingSendId?: string;
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
  }) => Promise<{ ok: boolean; error?: string; sendId?: string; status?: emailReplyApi.ReplySendRecord['status'] }>;

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

const mailSyncWatchers = new Set<string>();
const observedMailSyncJobs = new Map<string, string>();
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

function preserveSelection(previous: ResourceItem[], incoming: ResourceItem[]): ResourceItem[] {
  const selectedIds = new Set(previous.filter((r) => r.selected).map((r) => r.id));
  const existing = new Map(previous.map((r) => [r.id, r]));
  return incoming.map((r) => {
    const prior = existing.get(r.id);
    const newerSolutions = prior && (prior.solutionRevision || 0) > (r.solutionRevision || 0)
      ? { solutions: prior.solutions, constraintHistory: prior.constraintHistory, solutionRevision: prior.solutionRevision } : {};
    const newerReply = prior && (prior.repliedAt || '') > (r.repliedAt || '')
      ? { selectedSolutionId: prior.selectedSolutionId, repliedAt: prior.repliedAt } : {};
    return { ...r, ...newerSolutions, ...newerReply, selected: selectedIds.has(r.id) };
  });
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
      const loaded = await Promise.all(projects.map(async (project) => {
        const [resources, sessions, sends] = await Promise.all([
          workspaceApi.loadResources(project.id), workspaceApi.loadSessions(project.id), emailReplyApi.loadReplySends(project.id),
        ]);
        return { project: { ...project, ...resources }, sessions, sends };
      }));
      set({ projects: loaded.map((p) => p.project), chatSessions: loaded.flatMap((p) => p.sessions),
        sentMails: loaded.flatMap((p) => p.sends.filter((mail) => mail.status === 'sent')),
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
  refreshCalendarData: async (projectId) => {
    try {
      const [resources, sessions, events] = await Promise.all([
        workspaceApi.loadResources(projectId), workspaceApi.loadSessions(projectId), calendarApi.loadEvents(),
      ]);
      set((state) => state.projects.some((p) => p.id === projectId) ? ({
        projects: state.projects.map((p) => p.id === projectId ? { ...p, dailyOverview: resources.dailyOverview, resources: preserveSelection(p.resources, resources.resources) } : p),
        chatSessions: [...state.chatSessions.filter((s) => s.projectId !== projectId), ...sessions],
        calendarEvents: events.filter((event) => state.projects.some((p) => p.id === event.projectId)),
      }) : state);
    } catch (error) { get().addToast('warning', 'Thao tác đã được xử lý nhưng chưa tải lại đầy đủ dữ liệu lịch. ' + describeError(error)); }
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
  syncingMailProjectIds: [],
  pendingMailRoutes: {},
  uploadingPdfProjectId: null,

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

  deleteChatSession: async (sessionId) => {
    if (get().isAgentResponding) { get().addToast('warning', 'Chờ câu trả lời hoàn tất trước khi xóa phiên chat.'); return false; }
    const session = get().chatSessions.find((s) => s.id === sessionId);
    if (!session) return false;
    try {
      if (!session.isLocal) await workspaceApi.deleteSession(session.projectId, session.id);
      set((state) => ({ chatSessions: state.chatSessions.filter((s) => s.id !== sessionId),
        activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId }));
      get().addToast('destroy', 'Đã xóa phiên chat và tin nhắn.');
      return true;
    } catch (error) { get().addToast('warning', describeError(error)); return false; }
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
    get().addToast('success', 'Đã kết nối Google. Đang mở không gian làm việc.');
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
    if (!target) return false;
    if (get().isAgentResponding && get().chatSessions.some((s) => s.projectId === projectId && s.messages.some((m) => m.streamStatus === 'streaming'))) {
      get().addToast('warning', 'Chờ câu trả lời hoàn tất trước khi xóa dự án.'); return false;
    }
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
        pendingMailRoutes: Object.fromEntries(Object.entries(state.pendingMailRoutes)
          .filter(([id]) => id !== projectId).map(([id, routes]) => [id, routes.map((route) => ({ ...route,
            candidateProjectIds: route.candidateProjectIds.filter((candidate) => candidate !== projectId) })).filter((route) => route.candidateProjectIds.length)])),
        expandedToolbarByResourceId: Object.fromEntries(Object.entries(state.expandedToolbarByResourceId)
          .filter(([id]) => !target.resources.some((r) => r.id === id))),
      }));
      mailSyncWatchers.delete(projectId);
      observedMailSyncJobs.delete(projectId);
      set((state) => ({ isSyncingMail: mailSyncWatchers.size > 0, syncingMailProjectIds: state.syncingMailProjectIds.filter((id) => id !== projectId) }));
      get().addToast('destroy', `Đã xóa vĩnh viễn dự án "${target.title}" và dữ liệu trong ứng dụng.`);
      return true;
    } catch (error) { get().addToast('warning', describeError(error)); return false; }
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
                r.id === resourceId && !(r.type === 'mail' && ['queued', 'processing'].includes(r.processingStatus || '')) ? { ...r, selected: !r.selected } : r
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
              resources: p.resources.map((r) => ({ ...r, selected: selected && !(r.type === 'mail' && ['queued', 'processing'].includes(r.processingStatus || '')) })),
            }
      ),
    }));
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
    const pdf = project?.resources.flatMap((r) => r.type === 'pdf' ? [r] : r.attachedPdfs || [])
      .find((r) => r.id === resourceId || project?.resources.some((parent) => parent.id === resourceId && parent.type === 'mail' && parent.attachedPdfs?.length === 1 && parent.attachedPdfs[0].id === r.id));
    if (!pdf?.fileUrl) { get().addToast('warning', 'Không có file PDF gốc để mở.'); return; }
    if (options?.page && (!Number.isInteger(options.page) || options.page < 1 || options.page > pdf.pageCount)) {
      get().addToast('warning', 'Trích dẫn nằm ngoài số trang của PDF.'); return;
    }

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
        resourceId: pdf.id,
        targetPage,
        highlightSectionId,
        citationLabel: options?.citationLabel,
        citationQuote: options?.citationQuote,
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

  syncProjectEmails: async (projectId, resumeOnly = false) => {
    if (mailSyncWatchers.has(projectId)) return;
    if (resumeOnly && get().syncingMailProjectIds.includes(projectId)) return;
    mailSyncWatchers.add(projectId);
    const activate = () => set((state) => ({ isSyncingMail: true,
      syncingMailProjectIds: [...new Set([...state.syncingMailProjectIds, projectId])] }));
    if (!resumeOnly) activate();
    try {
      let job = resumeOnly ? await workspaceApi.readEmailSync(projectId) : await workspaceApi.startEmailSync(projectId);
      if (resumeOnly && (job.status === 'idle' || (job.id && observedMailSyncJobs.get(projectId) === job.id && ['complete', 'error'].includes(job.status)))) return;
      if (job.status === 'queued' || job.status === 'running') activate();
      while (true) {
        if (!get().projects.some((p) => p.id === projectId)) return;
        const resources = await workspaceApi.loadResources(projectId);
        if (!get().projects.some((p) => p.id === projectId)) return;
        const result = job.result;
        set((state) => ({ projects: state.projects.map((p) => p.id === projectId ? { ...p, dailyOverview: resources.dailyOverview, resources: preserveSelection(p.resources, resources.resources) } : p),
          ...(result ? { pendingMailRoutes: { ...state.pendingMailRoutes, [projectId]: result.ambiguous_messages.map((m) => ({
            messageId: m.message_id, senderEmail: m.sender_email, subject: m.subject, candidateProjectIds: m.candidate_project_ids,
          })) } } : {}) }));
        if (job.status === 'complete' || job.status === 'error' || job.status === 'idle') break;
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        job = await workspaceApi.readEmailSync(projectId);
      }
      if (job.id) observedMailSyncJobs.set(projectId, job.id);
      if (job.status === 'error') get().addToast('warning', job.error || 'Đồng bộ bị gián đoạn; nội dung đã nhận vẫn được giữ lại.');
      else if (job.result?.failed || job.result?.errors.length) get().addToast('warning', job.result.errors[0]?.message || 'Một số email chưa xử lý xong.');
      else if (job.result?.ambiguous_messages.length) get().addToast('info', 'Có email chờ bạn chọn dự án.');
      else if (job.status === 'complete') get().addToast('success', `Đã xử lý ${job.result?.new_processed || 0} email mới. Kết quả đã cập nhật từng thư.`);
    } catch (error) {
      if (get().projects.some((p) => p.id === projectId)) get().addToast('warning', describeError(error) + ' Nếu lượt đồng bộ đã bắt đầu, backend vẫn tiếp tục; mở lại dự án để xem trạng thái.');
    } finally {
      mailSyncWatchers.delete(projectId);
      set((state) => ({ isSyncingMail: mailSyncWatchers.size > 0,
        syncingMailProjectIds: state.syncingMailProjectIds.filter((id) => id !== projectId) }));
    }
  },

  routeMailToProject: async (projectId, messageId) => {
    if (get().syncingMailProjectIds.includes(projectId)) return;
    set((state) => ({ isSyncingMail: true, syncingMailProjectIds: [...state.syncingMailProjectIds, projectId] }));
    let routed = false;
    try {
      await workspaceApi.routeMailToProject(projectId, messageId);
      routed = true;
      set((state) => ({ pendingMailRoutes: Object.fromEntries(Object.entries(state.pendingMailRoutes)
        .map(([id, items]) => [id, items.filter((item) => item.messageId !== messageId)])) }));
    } catch (error) { get().addToast('warning', describeError(error)); }
    finally { set((state) => ({ isSyncingMail: state.syncingMailProjectIds.some((id) => id !== projectId), syncingMailProjectIds: state.syncingMailProjectIds.filter((id) => id !== projectId) })); }
    if (routed) await get().syncProjectEmails(projectId);
  },

  updateMailUrgency: async (projectId, resourceId, urgency) => {
    try {
      await workspaceApi.updateMailUrgency(projectId, resourceId, urgency);
      set((state) => ({ projects: state.projects.map((p) => p.id !== projectId ? p : { ...p,
        resources: p.resources.map((r) => r.id === resourceId && r.type === 'mail' ? { ...r, urgency } : r) }) }));
      get().addToast('success', 'Đã lưu mức ưu tiên email.');
    } catch (error) { get().addToast('warning', describeError(error)); }
  },

  retryEmailAnalysis: async (projectId, resourceId) => {
    try {
      await workspaceApi.retryEmailAnalysis(projectId, resourceId);
      const resources = await workspaceApi.loadResources(projectId);
      set((state) => ({ projects: state.projects.map((p) => p.id === projectId ? { ...p, dailyOverview: resources.dailyOverview, resources: preserveSelection(p.resources, resources.resources) } : p) }));
      get().addToast('success', 'Đã phân tích lại email từ nội dung đã lưu.');
    } catch (error) { get().addToast('warning', describeError(error)); }
  },

  uploadPdfFile: async (projectId, file) => {
    if (get().uploadingPdfProjectId) { get().addToast('info', 'Đang xử lý một PDF. Hãy chờ hoàn tất trước khi tải tệp tiếp theo.'); return; }
    set({ uploadingPdfProjectId: projectId });
    let uploaded = false;
    try {
      await workspaceApi.uploadProjectPdf(projectId, file);
      uploaded = true;
      const resources = await workspaceApi.loadResources(projectId);
      set((state) => ({ projects: state.projects.map((p) => p.id === projectId ? { ...p, dailyOverview: resources.dailyOverview, resources: preserveSelection(p.resources, resources.resources) } : p) }));
      get().addToast('success', `Đã lưu ${file.name} vào dự án.`);
    } catch (error) {
      get().addToast('warning', uploaded ? 'PDF đã lưu ở backend nhưng chưa tải lại được danh sách. Mở lại dự án, không cần tải file lên lần nữa.' : describeError(error));
    } finally { set({ uploadingPdfProjectId: null }); }
  },

  regenerateSolutions: async (projectId, resourceId, constraint) => {
    if (get().regeneratingSolutionsResourceId) return false;
    const resource = get().projects.find((p) => p.id === projectId)?.resources.find((r) => r.id === resourceId);
    if (!resource) return false;
    set({ regeneratingSolutionsResourceId: resourceId });
    try {
      const result = await workspaceApi.refineSolutions(projectId, resourceId, constraint.trim(), resource.solutionRevision || 0);
      set((state) => ({ projects: state.projects.map((p) => p.id === projectId ? {
        ...p, resources: p.resources.map((r) => r.id === resourceId ? { ...r, ...result, selectedSolutionId: undefined } : r),
      } : p) }));
      get().addToast('success', 'Đã cập nhật phương án và lưu ràng buộc.');
      return true;
    } catch (error) {
      get().addToast('warning', describeError(error));
      return false;
    } finally { set({ regeneratingSolutionsResourceId: null }); }
  },

  sendSolutionReplyMail: async (payload) => {
    if (!payload.pendingSendId && payload.files.some((file) => file.source === 'upload' && !file.file)) {
      return { ok: false, error: 'Có tệp tải lên chưa có dữ liệu. Gỡ rồi chọn lại tệp trước khi gửi.' };
    }
    try {
      const result = payload.pendingSendId
        ? await emailReplyApi.reconcileReply(payload.projectId, payload.pendingSendId, payload)
        : await emailReplyApi.sendReply(payload);
      if (result.status !== 'sent') return { ok: false, error: result.error || 'Lượt gửi chưa được xác nhận. Bấm Kiểm tra kết quả.', sendId: result.id, status: result.status };
      set((state) => ({ sentMails: [result, ...state.sentMails.filter((m) => m.id !== result.id)],
        projects: state.projects.map((p) => p.id === result.projectId ? { ...p, resources: p.resources.map((r) => r.id === result.resourceId
          ? { ...r, selectedSolutionId: result.solutionId, repliedAt: result.sentAt } : r) } : p) }));
      get().addToast('success', 'Gmail đã xác nhận gửi email.');
      // Refresh members independently; a failed refresh must not turn a confirmed
      // send into a failure that encourages the user to send another copy.
      try {
        const project = (await workspaceApi.listProjects()).find((p) => p.id === payload.projectId);
        if (project) set((state) => ({ projects: state.projects.map((p) => p.id === project.id ? { ...p, members: project.members } : p) }));
      } catch { get().addToast('warning', 'Email đã gửi; chưa tải lại được thành viên dự án. Không cần gửi lại.'); }
      return { ok: true, sendId: result.id, status: result.status };
    } catch (error) {
      const uncertain = !(error instanceof ApiError) || error.status >= 500;
      return { ok: false, error: describeError(error), sendId: uncertain ? payload.pendingSendId || payload.requestId : undefined,
        status: uncertain ? 'uncertain' : undefined };
    }
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
    const localId = session?.id || nextId('pending-session');
    const replyId = nextId('stream-reply'), now = new Date().toISOString();
    const chosenModel = state.modelProviders.flatMap((p) => p.models).find((m) => m.id === state.selectedModelId);
    const messages: ChatMessage[] = [
      { id: nextId('pending-user'), role: 'user', content: text, timestamp: now },
      { id: replyId, role: 'agent', content: '', timestamp: now, streamStatus: 'streaming',
        modelId: chosenModel?.modelId || chosenModel?.name, processingSteps: ['Đang gửi yêu cầu…'] },
    ];
    set((current) => ({ isAgentResponding: true, activeSessionId: localId,
      chatSessions: session ? current.chatSessions.map((s) => s.id === localId ? { ...s, messages: [...s.messages, ...messages] } : s)
        : [...current.chatSessions, { id: localId, projectId: project.id, title: text.slice(0, 80), updatedAt: now, messages, isLocal: true }] }));
    const patchReply = (patch: (message: ChatMessage) => Partial<ChatMessage>) => set((current) => ({
      chatSessions: current.chatSessions.map((s) => s.id === localId ? { ...s, messages: s.messages.map((m) => m.id === replyId ? { ...m, ...patch(m) } : m) } : s),
    }));
    let posted = false;
    let savedSessionId: string | null = null;
    try {
      await streamChat(project.id, session && !session.isLocal ? session.id : null, text,
        project.resources.filter((r) => r.selected).map((r) => r.id), state.selectedModelId, (event) => {
          if (event.type === 'delta') patchReply((m) => ({ content: m.content + event.text }));
          else if (event.type === 'summary') patchReply((m) => ({ reasoning: (m.reasoning || '') + event.text }));
          else if (event.type === 'status') patchReply((m) => ({ processingSteps: [...(m.processingSteps || []), event.text] }));
          else if (event.type === 'model') patchReply(() => ({ modelId: event.model_id, providerId: event.provider_id, fallbackUsed: event.fallback_used }));
          else if (event.type === 'done') {
            posted = true; savedSessionId = event.session_id;
            patchReply(() => ({ content: event.response, reasoning: event.thinking_process, modelId: event.model_id || undefined,
              providerId: event.provider_id || undefined, fallbackUsed: event.fallback_used, streamStatus: 'complete',
              referencedSourceNames: event.referenced_source_names, processingSteps: event.processing_steps, reasoningDurationSec: event.duration_seconds ?? undefined,
              calendarDrafts: (event.calendar_data?.drafts || []).map(calendarApi.toCalendarDraftItem) }));
          }
        });
      if (!savedSessionId) throw new Error('Chưa nhận được định danh phiên đã lưu.');
      const realId = savedSessionId;
      set((current) => ({ chatSessions: current.chatSessions.map((s) => s.id === localId ? { ...s, id: realId, isLocal: false } : s),
        activeSessionId: current.activeSessionId === localId ? realId : current.activeSessionId }));
      // The streamed answer remains visible even if the refresh below fails.
      const [savedSession, resources] = await Promise.all([workspaceApi.loadSession(project.id, realId), workspaceApi.loadResources(project.id)]);
      set((current) => current.projects.some((p) => p.id === project.id) ? ({
        projects: current.projects.map((p) => p.id === project.id ? { ...p, dailyOverview: resources.dailyOverview, resources: preserveSelection(p.resources, resources.resources) } : p),
        chatSessions: current.chatSessions.map((s) => s.id === realId ? savedSession : s),
      }) : current);
      return true;
    } catch (error) {
      if (!posted) patchReply(() => ({ streamStatus: 'error', streamError: describeError(error) }));
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
