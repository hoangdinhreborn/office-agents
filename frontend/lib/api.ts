import {
  ChatApiResponse,
  ChatSessionDetail,
  ChatSessionSummary,
  FeedbackRecord,
  FeedbackStats,
  SystemStatus,
  TasksListResponse,
  UpcomingEventsResponse,
} from "@/types";

const API_BASE = "/api";

export const api = {
  // Chat & Sessions
  async getSystemStatus(): Promise<SystemStatus> {
    const res = await fetch(`${API_BASE}/chat/status`);
    if (!res.ok) throw new Error("Không thể tải trạng thái hệ thống");
    return res.json();
  },

  async listChatSessions(): Promise<ChatSessionSummary[]> {
    const res = await fetch(`${API_BASE}/chat/sessions`);
    if (!res.ok) throw new Error("Không thể tải danh sách phiên chat");
    return res.json();
  },

  async createChatSession(title: string = "Cuộc trò chuyện mới"): Promise<ChatSessionSummary> {
    const res = await fetch(`${API_BASE}/chat/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error("Không thể tạo phiên chat mới");
    return res.json();
  },

  async getChatSessionDetail(sessionId: string): Promise<ChatSessionDetail> {
    const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}`);
    if (!res.ok) throw new Error("Không thể tải chi tiết phiên chat");
    return res.json();
  },

  async deleteChatSession(sessionId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Không thể xóa phiên chat");
    return res.json();
  },

  async sendMessage(params: {
    message: string;
    session_id?: string;
    folder_name?: string;
    allowed_senders?: string[];
  }): Promise<ChatApiResponse> {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error("Gửi tin nhắn thất bại");
    return res.json();
  },

  async sendMessageWithFile(message: string, file: File, session_id?: string): Promise<ChatApiResponse> {
    const fd = new FormData();
    fd.append("message", message);
    if (session_id) fd.append("session_id", session_id);
    fd.append("file", file);

    const res = await fetch(`${API_BASE}/chat/with-file`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) throw new Error("Gửi tệp đính kèm thất bại");
    return res.json();
  },

  // Tasks
  async getTasks(status: string = "all", source?: string): Promise<TasksListResponse> {
    const url = new URL(`${window.location.origin}${API_BASE}/tasks`);
    if (status) url.searchParams.set("status", status);
    if (source) url.searchParams.set("source", source);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Không thể tải danh sách công việc");
    return res.json();
  },

  async createTask(data: { title: string; due_date?: string; priority: string; source_type?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Không thể tạo công việc mới");
    return res.json();
  },

  async updateTask(taskId: string, data: { status?: string; title?: string; priority?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Không thể cập nhật công việc");
    return res.json();
  },

  async deleteTask(taskId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Không thể xóa công việc");
    return res.json();
  },

  // Calendar
  async getUpcomingEvents(hours: number = 24): Promise<UpcomingEventsResponse> {
    const res = await fetch(`${API_BASE}/calendar/upcoming?hours=${hours}`);
    if (!res.ok) throw new Error("Không thể tải sự kiện sắp tới");
    return res.json();
  },

  async getCalendarEvents(page: number = 1, pageSize: number = 10): Promise<any> {
    const res = await fetch(`${API_BASE}/calendar/events?page=${page}&page_size=${pageSize}`);
    if (!res.ok) throw new Error("Không thể tải danh sách sự kiện");
    return res.json();
  },

  async extractAndScheduleCalendar(text: string, reminderMinutes: number = 30): Promise<any> {
    const res = await fetch(`${API_BASE}/calendar/extract-and-schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, reminder_minutes: reminderMinutes }),
    });
    if (!res.ok) throw new Error("Không thể trích xuất và lên lịch");
    return res.json();
  },

  async createCalendarEvent(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/calendar/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Không thể tạo sự kiện lịch");
    return res.json();
  },

  // Emails (Gmail API v1)
  async fetchRawEmails(data: {
    folder_name?: string;
    allowed_senders?: string[];
    limit?: number;
    unread_only?: boolean;
  }): Promise<any[]> {
    const res = await fetch(`${API_BASE}/emails/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Không thể tải danh sách email");
    return res.json();
  },

  async analyzeEmails(data: {
    folder_name?: string;
    allowed_senders?: string[];
    limit?: number;
    unread_only?: boolean;
  }): Promise<any[]> {
    const res = await fetch(`${API_BASE}/emails/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Không thể quét hộp thư");
    return res.json();
  },

  async sendEmail(data: { to: string | string[]; subject: string; body: string }): Promise<any> {
    const toList = Array.isArray(data.to)
      ? data.to
      : data.to.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await fetch(`${API_BASE}/emails/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        to: toList,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Không thể gửi email");
    }
    return res.json();
  },

  // Feedback & RL DPO
  async submitFeedback(data: {
    agent_type: string;
    prompt: string;
    response: string;
    corrected_response?: string;
    rating: number;
    feedback_notes?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Không thể gửi đánh giá phản hồi");
    return res.json();
  },

  async getFeedbackStats(): Promise<FeedbackStats> {
    const res = await fetch(`${API_BASE}/feedback/stats`);
    if (!res.ok) throw new Error("Không thể tải thống kê phản hồi");
    return res.json();
  },

  async getFeedbackList(page: number = 1, pageSize: number = 10): Promise<{ items: FeedbackRecord[]; total: number }> {
    const res = await fetch(`${API_BASE}/feedback?page=${page}&page_size=${pageSize}`);
    if (!res.ok) throw new Error("Không thể tải danh sách phản hồi");
    return res.json();
  },

  async triggerDpoTrain(epochs: number = 3): Promise<any> {
    const res = await fetch(`${API_BASE}/feedback/train-dpo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epochs }),
    });
    if (!res.ok) throw new Error("Không thể khởi chạy huấn luyện DPO");
    return res.json();
  },

  async reloadOllamaModel(): Promise<any> {
    const res = await fetch(`${API_BASE}/feedback/reload-model`, { method: "POST" });
    if (!res.ok) throw new Error("Không thể tải lại mô hình Ollama");
    return res.json();
  },
};
