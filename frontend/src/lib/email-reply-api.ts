import { z } from 'zod';
import { apiRequest, jsonRequest, projectPath } from './api-client';
import type { ReplyAttachmentFile, ReplyAttachmentLink, SentMailRecord } from '../types/workspace';
import { formatBytesVi } from '../utils/format';

export const MAX_REPLY_ATTACHMENT_BYTES = 18 * 1024 * 1024;
const sendSchema = z.object({
  id: z.string(), project_id: z.string(), resource_id: z.string(), solution_id: z.string(),
  to: z.array(z.string()), cc: z.array(z.string()), subject: z.string(), body: z.string(),
  files: z.array(z.object({ id: z.string(), name: z.string(), size_bytes: z.number().nonnegative(), source: z.enum(['upload', 'resource']), resource_id: z.string().optional() })),
  links: z.array(z.object({ id: z.string(), label: z.string(), url: z.string() })),
  status: z.enum(['sending', 'sent', 'uncertain', 'failed']), error: z.string().nullable(), sent_at: z.string().nullable(),
});
export interface ReplySendRecord extends SentMailRecord {
  status: 'sending' | 'sent' | 'uncertain' | 'failed';
  error?: string;
}
function toSendRecord(value: unknown): ReplySendRecord {
  const record = sendSchema.parse(value);
  return { id: record.id, projectId: record.project_id, resourceId: record.resource_id, solutionId: record.solution_id,
    toEmails: record.to, ccEmails: record.cc, subject: record.subject, body: record.body,
    files: record.files.map((f) => ({ id: f.id, name: f.name, sizeLabel: formatBytesVi(f.size_bytes), sizeBytes: f.size_bytes, source: f.source, resourceId: f.resource_id })),
    links: record.links, sentAt: record.sent_at || '', status: record.status, error: record.error || undefined };
}
export async function loadReplySends(projectId: string, resourceId?: string) {
  const path = projectPath('/api/emails/reply-sends', projectId) + (resourceId ? `&resource_id=${encodeURIComponent(resourceId)}` : '');
  return z.array(sendSchema).parse(await apiRequest(path, { signal: AbortSignal.timeout(15000) })).map(toSendRecord);
}
export async function draftReply(projectId: string, resourceId: string, solutionId: string, to: string[], cc: string[], files: ReplyAttachmentFile[], links: ReplyAttachmentLink[], modelId: string, forceDraft = false) {
  return z.object({ subject: z.string(), body: z.string(), should_reply: z.boolean(), note: z.string().nullable() }).parse(await apiRequest(projectPath('/api/emails/reply-draft', projectId), {
    ...jsonRequest('POST', { resource_id: resourceId, solution_id: solutionId, model_id: modelId || null, force_draft: forceDraft, to, cc, attachment_names: files.map((f) => f.name), links }),
    signal: AbortSignal.timeout(300_000),
  }));
}
export interface SendReplyInput {
  requestId: string; projectId: string; resourceId: string; solutionId: string;
  toEmails: string[]; ccEmails: string[]; subject: string; body: string;
  files: ReplyAttachmentFile[]; links: ReplyAttachmentLink[]; saveNewEmailsToProject: boolean;
}
function replyPayload(input: SendReplyInput) {
  return { request_id: input.requestId, approved: true,
    resource_id: input.resourceId, solution_id: input.solutionId, to: input.toEmails, cc: input.ccEmails,
    subject: input.subject, body: input.body, resource_ids: input.files.filter((f) => f.source === 'resource').map((f) => f.resourceId),
    links: input.links, save_new_emails_to_project: input.saveNewEmailsToProject };
}
export async function sendReply(input: SendReplyInput) {
  const form = new FormData();
  for (const attachment of input.files.filter((f) => f.source === 'upload')) {
    if (!attachment.file) throw new Error(`Tệp ${attachment.name} chưa có dữ liệu. Chọn lại tệp trước khi gửi.`);
    form.append('files', attachment.file, attachment.name);
  }
  form.append('payload', JSON.stringify(replyPayload(input)));
  return toSendRecord(await apiRequest(projectPath('/api/emails/reply-send', input.projectId), { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) }));
}
export async function reconcileReply(projectId: string, id: string, input: SendReplyInput) {
  return toSendRecord(await apiRequest(projectPath(`/api/emails/reply-sends/${encodeURIComponent(id)}/reconcile`, projectId), { ...jsonRequest('POST', { ...replyPayload(input), request_id: id }), signal: AbortSignal.timeout(60_000) }));
}
