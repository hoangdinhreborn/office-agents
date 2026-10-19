import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().min(2, "Tiêu đề công việc phải có ít nhất 2 ký tự"),
  due_date: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  source_type: z.enum(["email", "pdf", "prompt"]).default("prompt"),
});

export type TaskFormValues = z.infer<typeof taskSchema>;

export const eventSchema = z.object({
  title: z.string().min(2, "Tiêu đề cuộc họp không được để trống"),
  start_time: z.string().min(1, "Vui lòng chọn thời gian bắt đầu"),
  end_time: z.string().optional(),
  location: z.string().optional(),
  reminder_minutes: z.coerce.number().min(0).default(30),
});

export type EventFormValues = z.infer<typeof eventSchema>;

export const emailSchema = z.object({
  to: z.string().email("Địa chỉ email người nhận không hợp lệ"),
  subject: z.string().min(1, "Tiêu đề thư không được để trống"),
  body: z.string().min(1, "Nội dung thư không được để trống"),
});

export type EmailFormValues = z.infer<typeof emailSchema>;

export const critiqueSchema = z.object({
  corrected_response: z.string().min(3, "Vui lòng nhập câu trả lời chuẩn theo ý bạn"),
  notes: z.string().optional(),
});

export type CritiqueFormValues = z.infer<typeof critiqueSchema>;
