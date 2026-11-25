import { z } from 'zod';
import type { ChatSession, MailboxLabel, DailyOverview, Project, ProjectConfig, ProjectMember, ResourceItem, PdfPage, PdfResource, PendingMailRoute, MailUrgency } from '../types/workspace';

import { apiRequest as request, jsonRequest as json, projectPath as scoped } from './api-client';
import { calendarDraftItemSchema, emptySchedule, toCalendarDraftItem } from './calendar-api';
export { projectUrl, apiRequest, jsonRequest } from './api-client';
import { projectUrl } from './api-client';

const labelSchema = z.object({ id: z.string(), name: z.string(), source: z.enum(['gmail', 'created']) });
const configSchema = z.object({
  mail_label_id: z.string().nullable(), mail_label_name: z.string().nullable(),
  mail_sync_interval_minutes: z.number(), default_reminder_minutes: z.number(), collect_rl_feedback: z.boolean(),
});
const projectSchema = z.object({
  id: z.string(), title: z.string(), icon: z.enum(['briefcase', 'file-text', 'scale', 'building', 'users', 'calendar-event', 'chart-bar', 'folder', 'mail', 'receipt', 'clipboard-list', 'target', 'database', 'bulb', 'shield-check', 'rocket', 'book', 'calculator', 'presentation', 'world']),
  created_at: z.string(), members: z.array(z.object({ id: z.string(), email: z.string(), role: z.enum(['nội bộ', 'khách']) })), config: configSchema,
});
const toProject = (data: unknown): Project => {
  const p = projectSchema.parse(data);
  return { id: p.id, title: p.title, icon: p.icon, createdAt: p.created_at, members: p.members, resources: [], config: {
    imapFolder: p.config.mail_label_name || '', mailLabelId: p.config.mail_label_id || undefined,
    mailLabelName: p.config.mail_label_name || undefined, mailSyncIntervalMinutes: p.config.mail_sync_interval_minutes,
    defaultReminderMinutes: p.config.default_reminder_minutes, collectRlFeedback: p.config.collect_rl_feedback,
  } };
};
const configPayload = (config: ProjectConfig) => ({
  mail_label_id: config.mailLabelId || null, mail_label_name: config.mailLabelName || null,
  mail_sync_interval_minutes: config.mailSyncIntervalMinutes, default_reminder_minutes: config.defaultReminderMinutes,
  collect_rl_feedback: config.collectRlFeedback,
});
const memberPayload = (members: ProjectMember[]) => members.map(({ email, role }) => ({ email, role }));

export const listProjects = async () => z.array(projectSchema).parse(await request('/api/projects')).map(toProject);
export const createProjectRecord = async (payload: { title: string; icon: Project['icon']; members: ProjectMember[]; config: ProjectConfig }) =>
  toProject(await request('/api/projects', json('POST', { ...payload, members: memberPayload(payload.members), config: configPayload(payload.config) })));
export const updateProjectRecord = async (id: string, payload: { title?: string; icon?: Project['icon']; config?: ProjectConfig; members?: ProjectMember[] }) =>
  toProject(await request(`/api/projects/${encodeURIComponent(id)}`, json('PATCH', { ...payload,
    ...(payload.config ? { config: configPayload(payload.config) } : {}),
    ...(payload.members ? { members: memberPayload(payload.members) } : {}),
  })));
export const deleteProjectRecord = (id: string) => request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const listMailboxLabels = async (): Promise<MailboxLabel[]> => z.array(labelSchema).parse(await request('/api/emails/mailbox-labels'));
export const createMailboxLabelRecord = async (name: string): Promise<MailboxLabel> => labelSchema.parse(await request('/api/emails/mailbox-labels', json('POST', { name })));
export const loadAccount = async () => z.object({ name: z.string(), email: z.string(), role: z.string(), avatarUrl: z.string() }).parse(await request('/api/account'));
export const loadGmailEmail = async () => z.object({ email: z.string().nullable() }).parse(await request('/api/emails/gmail/status')).email;

const pageSchema = z.object({ page_number: z.number().int().positive(), text: z.string() });
const pdfMetadataSchema = z.object({
  filename: z.string(), total_pages: z.number(), file_size: z.number(),
  is_ocr: z.boolean(), is_map_reduce: z.boolean(), pages: z.array(pageSchema),
  warning: z.string().nullable().optional(), file_available: z.boolean(),
});
const solutionSchema = z.object({ id: z.string(), title_markdown: z.string(), pros_cons_markdown: z.string() });
const urgencySchema = z.enum(['Thấp', 'Trung bình', 'Cao', 'Khẩn cấp']);
const resourcesSchema = z.object({
  daily_overview: z.object({ date: z.string(), markdown: z.string(), email_count: z.number().int().nonnegative(),
    highlight_ids: z.array(z.string()), max_words: z.number().int().positive() }).nullable(),
  documents: z.array(z.object({ id: z.string(), filename: z.string(), total_pages: z.number(), summary: z.string(),
    file_size: z.number().nullable(), has_file: z.boolean(), created_at: z.string(), pages: z.array(pageSchema),
    is_ocr: z.boolean(), is_map_reduce: z.boolean(), processing_warning: z.string().nullable(), schedule_drafts: z.array(calendarDraftItemSchema),
    solution_options: z.array(solutionSchema), constraint_history: z.array(z.string()), solution_revision: z.number().int().nonnegative(), selected_solution_id: z.string().nullable(), replied_at: z.string().nullable(),
  })),
  emails: z.array(z.object({ id: z.string(), subject: z.string(), sender_email: z.string(), sender_role: z.enum(['nội bộ', 'khách']),
    summary: z.string(), folder: z.string(), created_at: z.string(), urgency: urgencySchema,
    has_issue_to_solve: z.boolean(), has_calendar_event: z.boolean(), attached_pdfs: z.array(pdfMetadataSchema), status: z.string(),
    solution_options: z.array(solutionSchema), constraint_history: z.array(z.string()), solution_revision: z.number().int().nonnegative(), selected_solution_id: z.string().nullable(), replied_at: z.string().nullable(), schedule_drafts: z.array(calendarDraftItemSchema), processing_error: z.string().nullable(), processing_stage: z.string().nullable().optional(),
  })),
});
function pdfPages(pages: z.infer<typeof pageSchema>[], title: string): PdfPage[] {
  return pages.map((p) => ({ pageNumber: p.page_number, headerTitle: title,
    sections: [{ id: `page-${p.page_number}`, paragraphs: [p.text] }] }));
}
export async function loadResources(projectId: string): Promise<{ resources: ResourceItem[]; dailyOverview: DailyOverview | null }> {
  const data = resourcesSchema.parse(await request(`/api/projects/${encodeURIComponent(projectId)}/resources`, { signal: AbortSignal.timeout(30_000) }));
  const common = (summary: string, createdAt: string, rawDrafts: z.infer<typeof calendarDraftItemSchema>[] = []) => {
    const scheduleDrafts = rawDrafts.map(toCalendarDraftItem);
    return { createdAt, selected: false, summaryMarkdown: summary, solutions: [], scheduleDrafts,
      schedule: scheduleDrafts[0]?.draft || emptySchedule() };
  };
  const resources: ResourceItem[] = [
    ...data.documents.map((d) => ({ ...common(d.summary, d.created_at, d.schedule_drafts), id: d.id, type: 'pdf' as const, fileName: d.filename,
      sizeBytes: d.file_size || 0, fileSize: d.file_size === null ? '' : `${d.file_size} B`, pageCount: d.total_pages,
      solutions: d.solution_options.map((o) => ({ id: o.id, titleMarkdown: o.title_markdown, prosConsMarkdown: o.pros_cons_markdown })),
      constraintHistory: d.constraint_history, solutionRevision: d.solution_revision, selectedSolutionId: d.selected_solution_id || undefined, repliedAt: d.replied_at || undefined,
      isOcr: d.is_ocr, isMapReduce: d.is_map_reduce, processingWarning: d.processing_warning || undefined,
      pages: pdfPages(d.pages, d.filename),
      fileUrl: d.has_file ? projectUrl(`/api/documents/${encodeURIComponent(d.id)}/file`, projectId) : undefined })),
    ...data.emails.map((e) => {
      const attachedPdfs: PdfResource[] = e.attached_pdfs.map((pdf, index) => ({ ...common('', e.created_at), id: `${e.id}:pdf:${index}`, type: 'pdf',
        fileName: pdf.filename, sizeBytes: pdf.file_size, fileSize: `${pdf.file_size} B`, pageCount: pdf.total_pages,
        isOcr: pdf.is_ocr, isMapReduce: pdf.is_map_reduce, processingWarning: pdf.warning || undefined,
        pages: pdfPages(pdf.pages, pdf.filename), fileUrl: pdf.file_available
          ? projectUrl(`/api/emails/processed/${encodeURIComponent(e.id)}/pdf/${index}`, projectId) : undefined,
      }));
      return { ...common(e.summary, e.created_at, e.schedule_drafts), id: e.id, type: 'mail' as const, senderEmail: e.sender_email,
        senderRole: e.sender_role, subject: e.subject, folderName: e.folder, urgency: e.urgency,
        hasIssueToSolve: e.has_issue_to_solve, hasCalendarEvent: e.has_calendar_event,
        hasPdfAttachment: attachedPdfs.length > 0, attachedPdfs, processingStatus: e.status, processingStage: e.processing_stage || undefined, processingError: e.processing_error || undefined,
        constraintHistory: e.constraint_history, solutionRevision: e.solution_revision, selectedSolutionId: e.selected_solution_id || undefined, repliedAt: e.replied_at || undefined,
        solutions: e.solution_options.map((o) => ({ id: o.id, titleMarkdown: o.title_markdown, prosConsMarkdown: o.pros_cons_markdown })),
      };
    }),
  ];
  return { resources, dailyOverview: data.daily_overview };
}
const pendingRouteSchema = z.object({ message_id: z.string(), sender_email: z.string(), subject: z.string(), candidate_project_ids: z.array(z.string()) });
const syncResultSchema = z.object({ total_checked: z.number(), new_processed: z.number(), already_processed: z.number(), failed: z.number(),
  ambiguous_messages: z.array(pendingRouteSchema), errors: z.array(z.object({ message_id: z.string(), step: z.string(), message: z.string() })),
});
const syncJobSchema = z.object({ id: z.string().nullable(), status: z.enum(['idle', 'queued', 'running', 'complete', 'error']),
  result: syncResultSchema.nullable(), error: z.string().nullable() });
export const startEmailSync = async (projectId: string) => syncJobSchema.parse(await request(scoped('/api/emails/sync-jobs', projectId), { method: 'POST', signal: AbortSignal.timeout(15_000) }));
export const readEmailSync = async (projectId: string) => syncJobSchema.parse(await request(scoped('/api/emails/sync-jobs/current', projectId), { signal: AbortSignal.timeout(15_000) }));
export const routeMailToProject = (projectId: string, messageId: string) =>
  request(scoped('/api/emails/route', projectId), json('POST', { message_id: messageId }));
export const updateMailUrgency = (projectId: string, resourceId: string, urgency: MailUrgency) =>
  request(scoped(`/api/emails/processed/${encodeURIComponent(resourceId)}/urgency`, projectId), json('PATCH', { urgency }));
export const retryEmailAnalysis = (projectId: string, resourceId: string) =>
  request(scoped(`/api/emails/processed/${encodeURIComponent(resourceId)}/retry`, projectId), { method: 'POST' });
const sessionSchema = z.object({ id: z.string(), project_id: z.string().nullable(), title: z.string(), updated_at: z.string() });
const detailSchema = z.object({ session: sessionSchema, messages: z.array(z.object({ id: z.string(), role: z.enum(['user', 'ai']), content: z.string(), thinking_process: z.string(), created_at: z.string(), model_id: z.string().nullable().optional(), provider_id: z.string().nullable().optional(), fallback_used: z.boolean().optional(), calendar_drafts: z.array(calendarDraftItemSchema).default([]), referenced_source_names: z.array(z.string()).default([]), processing_steps: z.array(z.string()).default([]), duration_seconds: z.number().nullable().optional() })) });
export async function loadSession(projectId: string, sessionId: string): Promise<ChatSession> {
  const data = detailSchema.parse(await request(scoped(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, projectId)));
  return { id: data.session.id, projectId, title: data.session.title, updatedAt: data.session.updated_at,
    messages: data.messages.map((m) => ({ id: m.id, role: m.role === 'user' ? 'user' : 'agent',
      content: m.content, reasoning: m.thinking_process, timestamp: m.created_at, modelId: m.model_id || undefined,
      providerId: m.provider_id || undefined, fallbackUsed: m.fallback_used, calendarDrafts: m.calendar_drafts.map(toCalendarDraftItem),
      referencedSourceNames: m.referenced_source_names, processingSteps: m.processing_steps, reasoningDurationSec: m.duration_seconds ?? undefined })) };
}
export async function loadSessions(projectId: string): Promise<ChatSession[]> {
  const sessions = z.array(sessionSchema).parse(await request(scoped('/api/chat/sessions', projectId)));
  return Promise.all(sessions.map((session) => loadSession(projectId, session.id)));
}
export async function createSession(projectId: string): Promise<ChatSession> {
  const s = sessionSchema.parse(await request(scoped('/api/chat/sessions', projectId), json('POST', { title: 'Cuộc trò chuyện mới' })));
  return { id: s.id, projectId, title: s.title, updatedAt: s.updated_at, messages: [] };
}
export const postChatMessage = (projectId: string, sessionId: string | null, message: string, resourceIds: string[], modelId: string) =>
  request(scoped('/api/chat', projectId), json('POST', { message, session_id: sessionId, resource_ids: resourceIds, model_id: modelId }));
export const uploadProjectPdf = (projectId: string, file: File) => {
  const form = new FormData(); form.append('file', file);
  return request(scoped('/api/documents/summarize-pdf', projectId), { method: 'POST', body: form });
};

export const postFeedback = (projectId: string, prompt: string, response: string, feedback: 'up' | 'down') =>
  request(scoped('/api/feedback', projectId), json('POST', { agent_type: 'chat', prompt, response, rating: feedback === 'up' ? 1 : -1 }));

const refinedSolutionsSchema = z.object({ resource_id: z.string(), solution_options: z.array(solutionSchema).min(1).max(3),
  constraint_history: z.array(z.string()), solution_revision: z.number().int().positive() });
export async function refineSolutions(projectId: string, resourceId: string, constraint: string, revision: number) {
  const result = refinedSolutionsSchema.parse(await request(scoped(`/api/solutions/resources/${encodeURIComponent(resourceId)}/refine`, projectId),
    { ...json('POST', { constraint, revision }), signal: AbortSignal.timeout(300_000) }));
  if (result.resource_id !== resourceId) throw new Error('Kết quả giải pháp không khớp tài nguyên.');
  return { solutions: result.solution_options.map((o) => ({ id: o.id, titleMarkdown: o.title_markdown, prosConsMarkdown: o.pros_cons_markdown })),
    constraintHistory: result.constraint_history, solutionRevision: result.solution_revision };
}

export const deleteSession = (projectId: string, sessionId: string) =>
  request(scoped(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, projectId), { method: 'DELETE' });
