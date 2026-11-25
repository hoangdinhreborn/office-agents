import { z } from 'zod';

export const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
export const projectPath = (path: string, projectId: string) => `${path}?project_id=${encodeURIComponent(projectId)}`;
export const projectUrl = (path: string, projectId: string) => `${baseUrl}${projectPath(path, projectId)}`;
export const jsonRequest = (method: string, value: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

export class ApiError extends Error {
  constructor(message: string, public status: number, public detail: unknown) { super(message); }
}

export async function apiRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null);
    const error = z.object({ detail: z.unknown() }).safeParse(value);
    const detail = error.success ? error.data.detail : null;
    const messages = z.array(z.object({ msg: z.string() })).safeParse(detail);
    const conflict = z.object({ message: z.string() }).safeParse(detail);
    const message = typeof detail === 'string' ? detail : messages.success ? messages.data.map((d) => d.msg).join('; ')
      : conflict.success ? conflict.data.message : `Yêu cầu thất bại (${response.status}).`;
    throw new ApiError(message, response.status, detail);
  }
  return response.status === 204 ? null : response.json();
}
