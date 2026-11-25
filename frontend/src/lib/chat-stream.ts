import { z } from 'zod';
import { baseUrl, jsonRequest, projectPath } from './api-client';
import { calendarDraftItemSchema } from './calendar-api';

const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), text: z.string() }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('summary'), text: z.string() }),
  z.object({ type: z.literal('model'), model_id: z.string(), provider_id: z.string(), fallback_used: z.boolean() }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({ type: z.literal('done'), response: z.string(), referenced_source_names: z.array(z.string()).default([]), session_id: z.string(), model_id: z.string().nullable(),
    provider_id: z.string().nullable(), fallback_used: z.boolean(), thinking_process: z.string(),
    processing_steps: z.array(z.string()), duration_seconds: z.number().nullable(),
    calendar_data: z.object({ drafts: z.array(calendarDraftItemSchema) }).nullable() }),
]);
export type ChatStreamEvent = z.infer<typeof eventSchema>;

export async function streamChat(projectId: string, sessionId: string | null, message: string, resourceIds: string[], modelId: string,
  onEvent: (event: ChatStreamEvent) => void) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const touch = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), 45_000); };
  touch();
  try {
    const response = await fetch(`${baseUrl}${projectPath('/api/chat/stream', projectId)}`, {
      ...jsonRequest('POST', { message, session_id: sessionId, resource_ids: resourceIds, model_id: modelId }),
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, signal: controller.signal,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const parsed = z.object({ detail: z.string() }).safeParse(body);
      throw new Error(parsed.success ? parsed.data.detail : `Không mở được luồng trả lời (${response.status}).`);
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      throw new Error('Backend chưa trả luồng SSE. Hãy khởi động lại backend và kiểm tra cấu hình proxy.');
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', completed = false, data: string[] = [];
    const line = (value: string) => {
      if (value === '') {
        if (!data.length) return;
        const event = eventSchema.parse(JSON.parse(data.join('\n')));
        data = [];
        if (event.type === 'error') throw new Error(event.message);
        onEvent(event);
        if (event.type === 'done') completed = true;
      } else if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
    };
    try {
      while (!completed) {
        const chunk = await reader.read();
        if (chunk.done) break;
        touch();
        buffer += decoder.decode(chunk.value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const current = buffer.slice(0, newline).replace(/\r$/, '');
          buffer = buffer.slice(newline + 1);
          line(current);
        }
      }
      if (!completed) throw new Error('Luồng trả lời bị ngắt trước khi xác nhận lưu. Mở lại lịch sử trước khi gửi lại.');
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Không nhận được dữ liệu từ backend trong 45 giây. Mở lại lịch sử để kiểm tra kết quả; chưa tự gửi lại câu hỏi.');
    throw error;
  } finally { clearTimeout(timer); controller.abort(); }
}
