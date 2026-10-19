export interface ChatSessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessageItem {
  id: string;
  session_id: string;
  role: "user" | "ai";
  content: string;
  thinking_process?: string;
  agents_invoked?: string[];
  created_at: string;
}

export interface ChatSessionDetail {
  session: ChatSessionSummary;
  messages: ChatMessageItem[];
}

export interface ChatApiResponse {
  response: string;
  intent: string;
  agents_invoked: string[];
  thinking_process: string;
  session_id?: string;
  summary_data?: any;
  solution_data?: any;
  email_data?: any[];
  calendar_data?: any;
}

export interface SystemStatus {
  app_name: string;
  ollama_status: {
    connected: boolean;
    target_model?: string;
    models?: string[];
    [key: string]: any;
  };
  email_provider: string;
  calendar_provider: string;
  allowed_senders: string[];
  calendar_default_reminder_minutes: number;
}

export interface TaskItem {
  id: string;
  title: string;
  due_date?: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  source_type: "email" | "pdf" | "prompt";
  source_reference?: string | null;
  created_at: string;
}

export interface TasksListResponse {
  total: number;
  items: TaskItem[];
  stats: {
    total: number;
    pending: number;
    completed: number;
  };
}

export interface UpcomingEventItem {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  reminder_minutes: number;
  minutes_until: number;
  is_imminent: boolean;
}

export interface UpcomingEventsResponse {
  upcoming_count: number;
  imminent_count: number;
  items: UpcomingEventItem[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  reminder_minutes: number;
  synced_desktop: boolean;
  ics_path?: string;
}

export interface ProcessedEmail {
  id: string;
  sender: string;
  subject: string;
  received_time: string;
  urgency: string;
  summary: string;
  calendar_hint?: string;
  issue_description?: string;
}

export interface FeedbackRecord {
  id: string;
  agent_type: string;
  prompt: string;
  response: string;
  corrected_response?: string;
  rating: number;
  feedback_notes?: string;
  created_at: string;
}

export interface FeedbackStats {
  total_feedback: number;
  positive_count: number;
  negative_count: number;
  with_corrections_count: number;
}
