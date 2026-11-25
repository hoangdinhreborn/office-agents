import { z } from 'zod';
import type { CalendarConflict, CalendarDraftItem, CalendarEvent, ScheduleDraft } from '../types/workspace';
import { ApiError, apiRequest, jsonRequest, projectPath } from './api-client';

const repeatSchema = z.enum(['Does not repeat', 'Daily', 'Weekly on Wednesday', 'Monthly on the fourth Wednesday',
  'Monthly on the last Wednesday', 'Annually on November 25', 'Every weekday (Monday to Friday)', 'Custom...']);
export const calendarDraftSchema = z.object({
  title: z.string(), date: z.string().nullable(), start_time: z.string(), end_time: z.string(), all_day: z.boolean(), repeat: repeatSchema,
  custom_repeat: z.object({ interval: z.number(), unit: z.enum(['ngày', 'tuần', 'tháng', 'năm']), weekdays: z.array(z.number()),
    end_type: z.enum(['never', 'on_date', 'after_count']), end_date: z.string().nullable(), end_count: z.number() }),
  has_deadline: z.boolean(), deadline_date: z.string().nullable(), deadline_at: z.string().nullable().default(null), description: z.string(), needs_confirmation: z.boolean(),
  confidence: z.number().nullable(), is_approved: z.boolean(), approved_event_id: z.string().nullable(),
});
export const calendarDraftItemSchema = z.object({ id: z.string(), resource_id: z.string().nullable(), session_id: z.string().nullable(),
  revision: z.number(), event_id: z.string().nullable(), operation_status: z.string().nullable(),
  google_link: z.string().nullable().default(null), google_account_email: z.string().nullable().default(null), draft: calendarDraftSchema });
export function toCalendarDraftItem(item: z.infer<typeof calendarDraftItemSchema>): CalendarDraftItem {
  const d = item.draft, c = d.custom_repeat;
  return { id: item.id, resourceId: item.resource_id, sessionId: item.session_id, revision: item.revision, eventId: item.event_id,
    operationStatus: item.operation_status, googleLink: item.google_link, googleAccountEmail: item.google_account_email, draft: { title: d.title, date: d.date || '', startTime: d.start_time, endTime: d.end_time,
      allDay: d.all_day, repeat: d.repeat, customRepeat: { interval: c.interval, unit: c.unit, weekdays: c.weekdays,
        endType: c.end_type, endDate: c.end_date || '', endCount: c.end_count }, hasDeadline: d.has_deadline,
      deadlineDate: d.deadline_date || '', deadlineAt: d.deadline_at || undefined, description: d.description, needsConfirmation: d.needs_confirmation,
      confidence: d.confidence ?? undefined, isApproved: d.is_approved, approvedEventId: d.approved_event_id || undefined } };
}
export function emptySchedule(): ScheduleDraft {
  return { title: '', date: '', startTime: '', endTime: '', allDay: false, repeat: 'Does not repeat',
    customRepeat: { interval: 1, unit: 'tuần', weekdays: [], endType: 'never', endDate: '', endCount: 1 },
    hasDeadline: false, deadlineDate: '', description: '', isApproved: false };
}
function payload(d: ScheduleDraft) {
  return { title: d.title, date: d.date || null, start_time: d.startTime, end_time: d.endTime, all_day: d.allDay, repeat: d.repeat,
    custom_repeat: { interval: d.customRepeat.interval, unit: d.customRepeat.unit, weekdays: d.customRepeat.weekdays,
      end_type: d.customRepeat.endType, end_date: d.customRepeat.endDate || null, end_count: d.customRepeat.endCount },
    has_deadline: d.hasDeadline, deadline_date: d.deadlineDate || null, deadline_at: d.deadlineAt || null, description: d.description,
    needs_confirmation: d.needsConfirmation || false, confidence: d.confidence ?? null };
}
export async function saveDraft(projectId: string, resourceId: string | null, item: CalendarDraftItem | null, draft: ScheduleDraft) {
  const body = item ? { draft: payload(draft), expected_revision: item.revision } : { resource_id: resourceId, draft: payload(draft) };
  const path = item ? `/api/calendar/drafts/${encodeURIComponent(item.id)}` : '/api/calendar/drafts';
  return toCalendarDraftItem(calendarDraftItemSchema.parse(await apiRequest(projectPath(path, projectId), jsonRequest(item ? 'PATCH' : 'POST', body))));
}
export const readDraft = async (projectId: string, id: string) => toCalendarDraftItem(calendarDraftItemSchema.parse(
  await apiRequest(projectPath(`/api/calendar/drafts/${encodeURIComponent(id)}`, projectId))));
export const listDrafts = async (projectId: string, resourceId: string) => z.array(calendarDraftItemSchema).parse(
  await apiRequest(`${projectPath('/api/calendar/drafts', projectId)}&resource_id=${encodeURIComponent(resourceId)}`)).map(toCalendarDraftItem);
export async function extractDrafts(projectId: string, resourceId: string) {
  const result = z.object({ drafts: z.array(calendarDraftItemSchema) }).parse(await apiRequest(projectPath('/api/calendar/drafts/extract', projectId), jsonRequest('POST', { resource_id: resourceId })));
  return result.drafts.map(toCalendarDraftItem);
}
const conflictSchema = z.object({ id: z.string(), title: z.string(), start_time: z.string(), end_time: z.string(), all_day: z.boolean(), source: z.enum(['google', 'local']) });
function toConflict(c: z.infer<typeof conflictSchema>): CalendarConflict { return { id: c.id, title: c.title, startTime: c.start_time, endTime: c.end_time, allDay: c.all_day, source: c.source }; }
export async function checkConflicts(projectId: string, draft: ScheduleDraft, excludeEventId?: string | null) {
  const result = z.object({ conflicts: z.array(conflictSchema) }).parse(await apiRequest(projectPath('/api/calendar/conflicts', projectId), jsonRequest('POST', { draft: payload(draft), exclude_event_id: excludeEventId || null })));
  return result.conflicts.map(toConflict);
}
export function conflictsFromError(error: unknown): CalendarConflict[] | null {
  const result = error instanceof ApiError ? z.object({ conflicts: z.array(conflictSchema) }).safeParse(error.detail) : null;
  return result?.success ? result.data.conflicts.map(toConflict) : null;
}
const eventSchema = z.object({ id: z.string(), project_id: z.string(), resource_id: z.string().nullable(), title: z.string(),
  start_time: z.string(), end_time: z.string(), all_day: z.boolean(), recurrence: z.array(z.string()), deadline_date: z.string().nullable(),
  description: z.string(), reminder_minutes: z.number(), status: z.string(), created_at: z.string().nullable(),
  google_link: z.string().nullable().default(null), google_account_email: z.string().nullable().default(null) });
function toEvent(e: z.infer<typeof eventSchema>): CalendarEvent {
  const start = new Date(e.start_time).toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  const end = new Date(e.end_time).toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  return { id: e.id, googleLink: e.google_link || undefined, googleAccountEmail: e.google_account_email || undefined, projectId: e.project_id, resourceId: e.resource_id || '', title: e.title, date: start.slice(0, 10),
    startTime: start.slice(11, 16), endTime: end.slice(11, 16), allDay: e.all_day, repeatSummary: e.recurrence.join('; '),
    deadlineDate: e.deadline_date || undefined, description: e.description, reminderMinutes: e.reminder_minutes, createdAt: e.created_at || e.start_time };
}
export const loadEvents = async () => z.array(eventSchema).parse(await apiRequest('/api/calendar/events?all_projects=true'))
  .filter((e) => e.status === 'confirmed' || e.status === 'legacy').map(toEvent);
export async function approveDraft(projectId: string, item: CalendarDraftItem, allowConflicts: boolean) {
  const result = z.object({ event: eventSchema, draft: calendarDraftItemSchema, warning: z.string().nullable(), is_duplicate: z.boolean() }).parse(
    await apiRequest(projectPath('/api/calendar/events', projectId), jsonRequest('POST', { draft_id: item.id, expected_revision: item.revision, allow_conflicts: allowConflicts })));
  return { event: toEvent(result.event), draft: toCalendarDraftItem(result.draft), warning: result.warning, isDuplicate: result.is_duplicate };
}
export const undoEvent = (projectId: string, eventId: string) => apiRequest(projectPath(`/api/calendar/events/${encodeURIComponent(eventId)}`, projectId), { method: 'DELETE' });
export async function upcomingEvents() {
  return z.object({ items: z.array(z.object({ id: z.string(), occurrence_id: z.string(), title: z.string(), start_time: z.string(), all_day: z.boolean(), is_imminent: z.boolean() })) })
    .parse(await apiRequest('/api/calendar/upcoming?all_projects=true')).items;
}

export async function verifyEvent(projectId: string, eventId: string) {
  const result = z.object({ state: z.enum(['found', 'not_found', 'local_only', 'changed']), message: z.string(),
    event: eventSchema, draft: calendarDraftItemSchema.nullable() }).parse(
    await apiRequest(projectPath(`/api/calendar/events/${encodeURIComponent(eventId)}/verify`, projectId), { method: 'POST' }));
  return { state: result.state, message: result.message, event: toEvent(result.event),
    draft: result.draft ? toCalendarDraftItem(result.draft) : null };
}
