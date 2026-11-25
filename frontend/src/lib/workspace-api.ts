import { z } from 'zod';
import type { ChatSession, MailboxLabel, Project, ProjectConfig, ProjectMember, ResourceItem, ScheduleDraft } from '../types/workspace';

const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
export const projectUrl = (path: string, projectId: string) => `${baseUrl}${path}?project_id=${encodeURIComponent(projectId)}`;

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    const parsed = z.object({ detail: z.union([z.string(), z.array(z.object({ msg: z.string() }))]) }).safeParse(error);
    throw new Error(parsed.success
      ? typeof parsed.data.detail === 'string' ? parsed.data.detail : parsed.data.detail.map((d) => d.msg).join('; ')
      : `Yêu cầu thất bại (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}
const json = (method: string, value: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
const scoped = (path: string, projectId: string) => `${path}?project_id=${encodeURIComponent(projectId)}`;
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
export const restoreProjectRecord = async (id: string) => toProject(await request(`/api/projects/${encodeURIComponent(id)}/restore`, { method: 'POST' }));
export const listMailboxLabels = async (): Promise<MailboxLabel[]> => z.array(labelSchema).parse(await request('/api/emails/mailbox-labels'));
export const createMailboxLabelRecord = async (name: string): Promise<MailboxLabel> => labelSchema.parse(await request('/api/emails/mailbox-labels', json('POST', { name })));
export const loadAccount = async () => z.object({ name: z.string(), email: z.string(), role: z.string(), avatarUrl: z.string() }).parse(await request('/api/account'));
export const loadGmailEmail = async () => z.object({ email: z.string().nullable() }).parse(await request('/api/emails/gmail/status')).email;

function emptySchedule(): ScheduleDraft {
  return { title: '', date: '', startTime: '', endTime: '', allDay: false, repeat: 'Does not repeat',
    customRepeat: { interval: 1, unit: 'tuần', weekdays: [], endType: 'never', endDate: '', endCount: 1 },
    hasDeadline: false, deadlineDate: '', description: '', isApproved: false };
}
const resourcesSchema = z.object({
  documents: z.array(z.object({ id: z.string(), filename: z.string(), total_pages: z.number(), summary: z.string(), file_size: z.number().nullable(), has_file: z.boolean(), created_at: z.string() })),
  emails: z.array(z.object({ id: z.string(), subject: z.string(), sender_email: z.string(), sender_role: z.enum(['nội bộ', 'khách']), summary: z.string(), folder: z.string(), created_at: z.string() })),
});
export async function loadResources(projectId: string): Promise<ResourceItem[]> {
  const data = resourcesSchema.parse(await request(`/api/projects/${encodeURIComponent(projectId)}/resources`));
  const common = (summary: string, createdAt: string) => ({ createdAt, selected: false, activeSummaryStyle: 'ý chính' as const,
    summaryByStyle: { ngắn: summary, 'ý chính': summary, 'gạch đầu dòng': summary }, solutions: [], schedule: emptySchedule() });
  return [
    ...data.documents.map((d) => ({ ...common(d.summary, d.created_at), id: d.id, type: 'pdf' as const, fileName: d.filename,
      fileSize: d.file_size === null ? '' : `${d.file_size} B`, pageCount: d.total_pages,
      fileUrl: d.has_file ? projectUrl(`/api/documents/${encodeURIComponent(d.id)}/file`, projectId) : undefined })),
    ...data.emails.map((e) => ({ ...common(e.summary, e.created_at), id: e.id, type: 'mail' as const, senderEmail: e.sender_email,
      senderRole: e.sender_role, subject: e.subject, folderName: e.folder })),
  ];
}
const sessionSchema = z.object({ id: z.string(), project_id: z.string().nullable(), title: z.string(), updated_at: z.string() });
const detailSchema = z.object({ session: sessionSchema, messages: z.array(z.object({ id: z.string(), role: z.enum(['user', 'ai']), content: z.string(), thinking_process: z.string(), created_at: z.string(), model_id: z.string().nullable().optional(), provider_id: z.string().nullable().optional(), fallback_used: z.boolean().optional() })) });
export async function loadSessions(projectId: string): Promise<ChatSession[]> {
  const sessions = z.array(sessionSchema).parse(await request(scoped('/api/chat/sessions', projectId)));
  return Promise.all(sessions.map(async (session) => {
    const data = detailSchema.parse(await request(scoped(`/api/chat/sessions/${encodeURIComponent(session.id)}`, projectId)));
    return { id: session.id, projectId, title: data.session.title, updatedAt: data.session.updated_at,
      messages: data.messages.map((m) => ({ id: m.id, role: m.role === 'user' ? 'user' as const : 'agent' as const,
        content: m.content, reasoning: m.thinking_process, timestamp: m.created_at, modelId: m.model_id || undefined, providerId: m.provider_id || undefined, fallbackUsed: m.fallback_used })) };
  }));
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

export { request as apiRequest, json as jsonRequest };
