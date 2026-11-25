export type MemberRole = 'nội bộ' | 'khách';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ProjectIconCode =
  | 'briefcase'
  | 'file-text'
  | 'scale'
  | 'building'
  | 'users'
  | 'calendar-event'
  | 'chart-bar'
  | 'folder'
  | 'mail'
  | 'receipt'
  | 'clipboard-list'
  | 'target'
  | 'database'
  | 'bulb'
  | 'shield-check'
  | 'rocket'
  | 'book'
  | 'calculator'
  | 'presentation'
  | 'world';

export interface ProjectMember {
  id: string;
  email: string;
  role: MemberRole;
}

export type SummaryStyle = 'ngắn' | 'ý chính' | 'gạch đầu dòng';

export interface SolutionOption {
  id: string;
  titleMarkdown: string;
  prosConsMarkdown: string;
  constraintHistory?: string[];
}

export type RepeatOption =
  | 'Does not repeat'
  | 'Daily'
  | 'Weekly on Wednesday'
  | 'Monthly on the fourth Wednesday'
  | 'Monthly on the last Wednesday'
  | 'Annually on November 25'
  | 'Every weekday (Monday to Friday)'
  | 'Custom...';

export type RepeatUnit = 'ngày' | 'tuần' | 'tháng' | 'năm';
export type RepeatEndType = 'never' | 'on_date' | 'after_count';

export interface CustomRecurrence {
  interval: number;
  unit: RepeatUnit;
  weekdays: number[]; // 0=S, 1=M, 2=T, 3=W, 4=T, 5=F, 6=S
  endType: RepeatEndType;
  endDate: string; // YYYY-MM-DD
  endCount: number;
}

export interface ScheduleDraft {
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  allDay: boolean;
  repeat: RepeatOption;
  customRepeat: CustomRecurrence;
  hasDeadline: boolean;
  deadlineDate: string; // YYYY-MM-DD
  description: string;
  isApproved: boolean;
  approvedEventId?: string;
}

export interface CalendarEvent {
  id: string;
  projectId: string;
  resourceId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  repeatSummary: string;
  deadlineDate?: string;
  description: string;
  reminderMinutes: number;
  createdAt: string;
}

export interface ReplyAttachmentFile {
  id: string;
  name: string;
  sizeLabel: string;
  source: 'upload' | 'resource';
  resourceId?: string;
}

export interface ReplyAttachmentLink {
  id: string;
  label: string;
  url: string;
}

export interface SentMailRecord {
  id: string;
  projectId: string;
  resourceId: string;
  solutionId: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  body: string;
  files: ReplyAttachmentFile[];
  links: ReplyAttachmentLink[];
  sentAt: string;
}

export type ResourceType = 'pdf' | 'mail';

export interface BaseResource {
  id: string;
  type: ResourceType;
  createdAt: string; // ISO string
  selected: boolean;
  summaryByStyle: Record<SummaryStyle, string>;
  activeSummaryStyle: SummaryStyle;
  solutions: SolutionOption[];
  selectedSolutionId?: string;
  repliedAt?: string;
  schedule: ScheduleDraft;
}

export interface PdfSection {
  id: string;
  heading?: string;
  paragraphs: string[];
  table?: {
    headers: string[];
    rows: string[][];
  };
  citationTag?: string;
}

export interface PdfPage {
  pageNumber: number;
  headerTitle: string;
  sections: PdfSection[];
}

export interface PdfViewerState {
  projectId: string;
  resourceId: string;
  targetPage: number;
  highlightSectionId?: string;
  citationLabel?: string;
  focusNonce: number;
}

export interface PdfResource extends BaseResource {
  type: 'pdf';
  fileName: string;
  fileSize: string; // e.g., "2,4 MB"
  pageCount: number;
  isOcr?: boolean;
  isMapReduce?: boolean;
  documentCode?: string;
  issuedDate?: string;
  fileUrl?: string;
  pages?: PdfPage[];
}

export interface MailResource extends BaseResource {
  type: 'mail';
  senderEmail: string;
  senderRole: MemberRole;
  subject: string;
  folderName: string;
  hasPdfAttachment?: boolean;
}

export type ResourceItem = PdfResource | MailResource;

export interface MailboxLabel {
  id: string;
  name: string;
  messageCount: number;
  source: 'gmail' | 'created';
}

export interface ProjectConfig {
  imapFolder: string;
  mailLabelId?: string;
  mailLabelName?: string;
  defaultSummaryStyle: SummaryStyle;
  mailSyncIntervalMinutes: number;
  defaultReminderMinutes: number;
  collectRlFeedback: boolean;
}

export interface Project {
  id: string;
  title: string;
  icon: ProjectIconCode;
  createdAt: string; // ISO string
  members: ProjectMember[];
  resources: ResourceItem[];
  config: ProjectConfig;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  reasoning?: string;
  reasoningDurationSec?: number;
  timestamp: string;
  referencedSourceNames?: string[];
  feedback?: 'up' | 'down' | null;
}

export interface ChatSession {
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export type ApiProtocol =
  | 'openai-chat'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'ollama-native';

export type ProviderSourceType = 'builtin' | 'custom';

export interface ModelItem {
  id: string;
  modelId?: string;
  name: string;
  provider: string;
  providerId?: string;
  contextWindow: string;
  maxOutputTokens?: string;
  quantization: string;
  supportsText?: boolean;
  supportsImage?: boolean;
  supportsReasoning?: boolean;
  isRlTuned?: boolean;
}

export interface ModelProviderConfig {
  id: string;
  sourceType: ProviderSourceType;
  builtinKey?: string;
  displayName: string;
  baseUrl: string;
  protocol: ApiProtocol;
  authEnvVar?: string;
  isLocalRuntime?: boolean;
  connectionStatus?: 'connected' | 'unconfigured' | 'error';
  models: ModelItem[];
}

export interface LocalLlmConfig {
  endpointUrl: string;
  activeAdapterVersion: string;
  previousAdapterVersion: string;
  quantizationFallback: string;
}

export type SortMode = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';
export type ResourceViewMode = 'default' | 'week' | 'input';
export type ToolbarTab = 'summarize' | 'solution' | 'schedule';

export type ToastVariant = 'info' | 'success' | 'warning' | 'destroy';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  undoLabel?: string;
  onUndo?: () => void;
}
