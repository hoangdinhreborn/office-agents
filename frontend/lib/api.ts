import {
  ChatApiResponse,
  ChatSessionDetail,
  ChatSessionSummary,
  DailyDigestResponse,
  EmailFolderRule,
  FeedbackRecord,
  FeedbackStats,
  ProcessedEmail,
  SystemStatus,
  TasksListResponse,
  UpcomingEventsResponse,
} from "@/types";

const getApiBase = (): string => {
  const envBase = process.env.NEXT_PUBLIC_API_BASE?.trim().replace(/['"]/g, "");
  if (envBase) {
    return `${envBase.replace(/\/+$/, "")}/api`;
  }
  return "http://127.0.0.1:8000/api";
};

const API_BASE = getApiBase();

const buildUrl = (path: string): URL => {
  if (API_BASE.startsWith("http://") || API_BASE.startsWith("https://")) {
    return new URL(`${API_BASE}${path}`);
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8000";
  return new URL(`${origin}${API_BASE}${path}`);
};

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
    const url = buildUrl("/tasks");
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
    page_token?: string;
  }): Promise<{ items: any[]; next_page_token?: string; count: number }> {
    const res = await fetch(`${API_BASE}/emails/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Không thể tải danh sách email");
    const json = await res.json();
    if (Array.isArray(json)) {
      return { items: json, count: json.length };
    }
    return json;
  },

  async analyzeEmails(data: {
    folder_name?: string;
    allowed_senders?: string[];
    limit?: number;
    unread_only?: boolean;
    page_token?: string;
  }): Promise<{ items: any[]; next_page_token?: string; count: number }> {
    const res = await fetch(`${API_BASE}/emails/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Không thể quét hộp thư");
    const json = await res.json();
    if (Array.isArray(json)) {
      return { items: json, count: json.length };
    }
    return json;
  },

  async getProcessedEmails(params?: {
    page?: number;
    page_size?: number;
    folder?: string;
    category?: string;
  }): Promise<{ items: ProcessedEmail[]; total: number; page: number; total_pages: number }> {
    const url = buildUrl("/emails/processed");
    if (params?.page) url.searchParams.set("page", String(params.page));
    if (params?.page_size) url.searchParams.set("page_size", String(params.page_size));
    if (params?.folder) url.searchParams.set("folder", params.folder);
    if (params?.category) url.searchParams.set("category", params.category);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Không thể tải email đã lưu trong cơ sở dữ liệu");
    const json = await res.json();
    if (Array.isArray(json)) {
      return { items: json, total: json.length, page: 1, total_pages: 1 };
    }
    return json;
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

  async triggerEmailPollNow(): Promise<any> {
    const res = await fetch(`${API_BASE}/emails/poll-now`, { method: "POST" });
    if (!res.ok) throw new Error("Không thể kích hoạt quét email");
    return res.json();
  },

  async getEmailLabels(): Promise<{ folders: string[]; labels: string[] }> {
    const res = await fetch(`${API_BASE}/emails/folders`);
    if (!res.ok) throw new Error("Không thể tải danh sách thư mục");
    return res.json();
  },

  async listFolderRules(): Promise<EmailFolderRule[]> {
    const res = await fetch(`${API_BASE}/emails/rules`);
    if (!res.ok) throw new Error("Không thể tải danh sách luật phân loại");
    return res.json();
  },

  async createFolderRule(data: Partial<EmailFolderRule>): Promise<any> {
    const res = await fetch(`${API_BASE}/emails/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Không thể lưu luật phân loại");
    }
    return res.json();
  },

  async deleteFolderRule(ruleId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/emails/rules/${ruleId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Không thể xóa luật phân loại");
    return res.json();
  },

  async getDailyDigest(date?: string): Promise<DailyDigestResponse> {
    const res = await fetch(`${API_BASE}/emails/daily-digest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) throw new Error("Không thể tải báo cáo tổng hợp email");
    return res.json();
  },

  async exportDailyDigestPDF(date?: string, filename?: string): Promise<{
    success: boolean;
    filename: string;
    download_url: string;
    total_emails: number;
    urgent_count: number;
    categories: Record<string, number>;
  }> {
    const res = await fetch(`${API_BASE}/emails/daily-digest/export-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, filename }),
    });
    if (!res.ok) throw new Error("Không thể xuất file PDF báo cáo");
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
