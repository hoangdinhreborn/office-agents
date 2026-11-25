import {
  MOCK_PDF_AUDIT_2026,
  MOCK_PDF_BIEN_BAN_OCR,
  MOCK_PDF_FINANCE_T10,
  MOCK_PDF_LAUNCH_V2,
  MOCK_PDF_MINH_KHOI_Q4,
} from './mockPdfDocuments';
import type {
  ApiProtocol,
  CalendarEvent,
  ChatSession,
  CustomRecurrence,
  LocalLlmConfig,
  MailboxLabel,
  ModelItem,
  ModelProviderConfig,
  Project,
} from '../types/workspace';

export const CURRENT_USER = {
  name: 'Nguyễn Minh Tuấn',
  role: 'Trưởng nhóm vận hành',
  email: 'tuan.nguyen@soviectech.vn',
  avatarUrl: '/src/assets/images/avatar_office_user_1795542185492.jpg',
};

export const DEFAULT_CUSTOM_RECURRENCE: CustomRecurrence = {
  interval: 1,
  unit: 'tuần',
  weekdays: [3], // Wednesday
  endType: 'never',
  endDate: '2026-12-31',
  endCount: 5,
};

export const LOCAL_MODELS: ModelItem[] = [
  {
    id: 'qwen3-14b-q4',
    name: 'qwen3:14b-q4',
    provider: 'Ollama (Local)',
    contextWindow: '32K',
    quantization: 'Q4_K_M',
  },
  {
    id: 'qwen2.5-7b-instruct',
    name: 'qwen2.5:7b-instruct',
    provider: 'Ollama (Local)',
    contextWindow: '32K',
    quantization: 'Q4_K_M',
  },
  {
    id: 'llama3.1-8b-local',
    name: 'llama3.1:8b-local',
    provider: 'Ollama (Local)',
    contextWindow: '16K',
    quantization: 'Q8_0',
  },
  {
    id: 'qwen3.5-9b-office-rl-v2',
    name: 'Qwen3.5-9B-Office-RL-v2',
    provider: 'vLLM (Nội bộ)',
    contextWindow: '32K',
    quantization: 'FP8 + LoRA',
    isRlTuned: true,
  },
  {
    id: 'qwen3.5-9b-base',
    name: 'Qwen3.5-9B-Base',
    provider: 'vLLM (Nội bộ)',
    contextWindow: '32K',
    quantization: 'FP8',
  },
  {
    id: 'gemma-3-12b-it',
    name: 'gemma-3-12b-it',
    provider: 'LM Studio',
    contextWindow: '32K',
    quantization: 'Q4_K_M',
  },
];

export const INITIAL_LOCAL_LLM_CONFIG: LocalLlmConfig = {
  endpointUrl: 'http://127.0.0.1:11434/v1',
  activeAdapterVersion: 'office-rl-v2.1 (pass^3: 96%)',
  previousAdapterVersion: 'office-rl-v1.8 (pass^3: 91%)',
  quantizationFallback: 'qwen2.5:7b-q4_k_m',
};

export interface BuiltinProviderPreset {
  key: string;
  label: string;
  defaultDisplayName: string;
  defaultBaseUrl: string;
  defaultProtocol: ApiProtocol;
  defaultAuthEnvVar: string;
  defaultModels: Omit<ModelItem, 'id' | 'provider' | 'providerId'>[];
}

export const BUILTIN_PROVIDER_PRESETS: BuiltinProviderPreset[] = [
  {
    key: 'ollama',
    label: 'Ollama (Local)',
    defaultDisplayName: 'Ollama (Local)',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    defaultProtocol: 'openai-chat',
    defaultAuthEnvVar: 'OLLAMA_API_TOKEN',
    defaultModels: [
      {
        modelId: 'qwen3:14b-q4',
        name: 'qwen3:14b-q4',
        contextWindow: '32K',
        maxOutputTokens: '8K',
        quantization: 'Q4_K_M',
        supportsText: true,
        supportsImage: false,
        supportsReasoning: true,
      },
      {
        modelId: 'qwen2.5:7b-instruct',
        name: 'qwen2.5:7b-instruct',
        contextWindow: '32K',
        maxOutputTokens: '8K',
        quantization: 'Q4_K_M',
        supportsText: true,
        supportsImage: false,
        supportsReasoning: false,
      },
      {
        modelId: 'llama3.1:8b-local',
        name: 'llama3.1:8b-local',
        contextWindow: '16K',
        maxOutputTokens: '4K',
        quantization: 'Q8_0',
        supportsText: true,
        supportsImage: false,
        supportsReasoning: false,
      },
    ],
  },
  {
    key: 'vllm',
    label: 'vLLM (Nội bộ)',
    defaultDisplayName: 'vLLM (Nội bộ)',
    defaultBaseUrl: 'http://127.0.0.1:8000/v1',
    defaultProtocol: 'openai-chat',
    defaultAuthEnvVar: 'VLLM_INTERNAL_TOKEN',
    defaultModels: [
      {
        modelId: 'Qwen/Qwen3.5-9B-Office-RL-v2',
        name: 'Qwen3.5-9B-Office-RL-v2',
        contextWindow: '32K',
        maxOutputTokens: '8K',
        quantization: 'FP8 + LoRA',
        supportsText: true,
        supportsImage: false,
        supportsReasoning: true,
        isRlTuned: true,
      },
      {
        modelId: 'Qwen/Qwen3.5-9B-Base',
        name: 'Qwen3.5-9B-Base',
        contextWindow: '32K',
        maxOutputTokens: '8K',
        quantization: 'FP8',
        supportsText: true,
        supportsImage: false,
        supportsReasoning: false,
      },
    ],
  },
  {
    key: 'lmstudio',
    label: 'LM Studio',
    defaultDisplayName: 'LM Studio',
    defaultBaseUrl: 'http://127.0.0.1:1234/v1',
    defaultProtocol: 'openai-chat',
    defaultAuthEnvVar: 'LMSTUDIO_LOCAL_TOKEN',
    defaultModels: [
      {
        modelId: 'gemma-3-12b-it',
        name: 'gemma-3-12b-it',
        contextWindow: '32K',
        maxOutputTokens: '8K',
        quantization: 'Q4_K_M',
        supportsText: true,
        supportsImage: true,
        supportsReasoning: false,
      },
    ],
  },
  {
    key: 'litellm',
    label: 'LiteLLM Gateway',
    defaultDisplayName: 'LiteLLM Nội bộ',
    defaultBaseUrl: 'http://127.0.0.1:4000/v1',
    defaultProtocol: 'openai-responses',
    defaultAuthEnvVar: 'LITELLM_GATEWAY_TOKEN',
    defaultModels: [
      {
        modelId: 'office-router-auto',
        name: 'Office Router Auto',
        contextWindow: '128K',
        maxOutputTokens: '16K',
        quantization: 'Gateway',
        supportsText: true,
        supportsImage: true,
        supportsReasoning: true,
      },
    ],
  },
  {
    key: 'anthropic-compat',
    label: 'Anthropic Compatible',
    defaultDisplayName: 'Anthropic Gateway',
    defaultBaseUrl: 'http://127.0.0.1:2455/v1',
    defaultProtocol: 'anthropic-messages',
    defaultAuthEnvVar: 'ANTHROPIC_GATEWAY_TOKEN',
    defaultModels: [
      {
        modelId: 'claude-sonnet-internal',
        name: 'Claude Sonnet (Gateway)',
        contextWindow: '200K',
        maxOutputTokens: '16K',
        quantization: 'Proxy',
        supportsText: true,
        supportsImage: true,
        supportsReasoning: true,
      },
    ],
  },
];

export const FETCHABLE_MODEL_CATALOGS: Record<
  string,
  Omit<ModelItem, 'id' | 'provider' | 'providerId'>[]
> = {
  ollama: [
    {
      modelId: 'qwen3:14b-q4',
      name: 'qwen3:14b-q4',
      contextWindow: '32K',
      maxOutputTokens: '8K',
      quantization: 'Q4_K_M',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: true,
    },
    {
      modelId: 'qwen3:32b-q4_k_m',
      name: 'qwen3:32b-q4_k_m',
      contextWindow: '64K',
      maxOutputTokens: '16K',
      quantization: 'Q4_K_M',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: true,
    },
    {
      modelId: 'qwen2.5:14b-instruct',
      name: 'qwen2.5:14b-instruct',
      contextWindow: '32K',
      maxOutputTokens: '8K',
      quantization: 'Q4_K_M',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: false,
    },
    {
      modelId: 'deepseek-r1:14b',
      name: 'deepseek-r1:14b',
      contextWindow: '64K',
      maxOutputTokens: '16K',
      quantization: 'Q4_K_M',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: true,
    },
    {
      modelId: 'gemma3:12b-it',
      name: 'gemma3:12b-it',
      contextWindow: '128K',
      maxOutputTokens: '8K',
      quantization: 'Q4_K_M',
      supportsText: true,
      supportsImage: true,
      supportsReasoning: false,
    },
    {
      modelId: 'llama3.3:8b-instruct',
      name: 'llama3.3:8b-instruct',
      contextWindow: '32K',
      maxOutputTokens: '8K',
      quantization: 'Q8_0',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: false,
    },
    {
      modelId: 'mistral-small3.1:24b',
      name: 'mistral-small3.1:24b',
      contextWindow: '128K',
      maxOutputTokens: '16K',
      quantization: 'Q4_K_M',
      supportsText: true,
      supportsImage: true,
      supportsReasoning: false,
    },
  ],
  vllm: [
    {
      modelId: 'Qwen/Qwen3.5-9B-Office-RL-v2',
      name: 'Qwen3.5-9B-Office-RL-v2',
      contextWindow: '32K',
      maxOutputTokens: '8K',
      quantization: 'FP8 + LoRA',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: true,
      isRlTuned: true,
    },
    {
      modelId: 'Qwen/Qwen3-14B-FP8',
      name: 'Qwen3-14B-FP8',
      contextWindow: '128K',
      maxOutputTokens: '16K',
      quantization: 'FP8',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: true,
    },
    {
      modelId: 'Qwen/Qwen2.5-VL-7B-Instruct',
      name: 'Qwen2.5-VL-7B-Instruct',
      contextWindow: '64K',
      maxOutputTokens: '8K',
      quantization: 'BF16',
      supportsText: true,
      supportsImage: true,
      supportsReasoning: false,
    },
    {
      modelId: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
      name: 'DeepSeek-R1-Distill-14B',
      contextWindow: '64K',
      maxOutputTokens: '16K',
      quantization: 'FP8',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: true,
    },
    {
      modelId: 'meta-llama/Llama-3.3-70B-Instruct',
      name: 'Llama-3.3-70B-Instruct',
      contextWindow: '128K',
      maxOutputTokens: '16K',
      quantization: 'AWQ-INT4',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: false,
    },
  ],
  lmstudio: [
    {
      modelId: 'gemma-3-12b-it',
      name: 'gemma-3-12b-it',
      contextWindow: '32K',
      maxOutputTokens: '8K',
      quantization: 'Q4_K_M',
      supportsText: true,
      supportsImage: true,
      supportsReasoning: false,
    },
    {
      modelId: 'qwen3-8b-mlx',
      name: 'qwen3-8b-mlx',
      contextWindow: '64K',
      maxOutputTokens: '16K',
      quantization: 'MLX-4bit',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: true,
    },
    {
      modelId: 'phi-4-reasoning-plus',
      name: 'phi-4-reasoning-plus',
      contextWindow: '32K',
      maxOutputTokens: '16K',
      quantization: 'Q6_K',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: true,
    },
    {
      modelId: 'mistral-nemo-instruct-2407',
      name: 'mistral-nemo-12b',
      contextWindow: '128K',
      maxOutputTokens: '8K',
      quantization: 'Q4_K_M',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: false,
    },
  ],
  default: [
    {
      modelId: 'qwen3-32b-instruct',
      name: 'Qwen3 32B Instruct',
      contextWindow: '128K',
      maxOutputTokens: '16K',
      quantization: 'API',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: true,
    },
    {
      modelId: 'deepseek-r1-0528',
      name: 'DeepSeek R1',
      contextWindow: '128K',
      maxOutputTokens: '16K',
      quantization: 'API',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: true,
    },
    {
      modelId: 'gemma-3-27b-it',
      name: 'Gemma 3 27B IT',
      contextWindow: '128K',
      maxOutputTokens: '8K',
      quantization: 'API',
      supportsText: true,
      supportsImage: true,
      supportsReasoning: false,
    },
    {
      modelId: 'llama-3.3-70b-versatile',
      name: 'Llama 3.3 70B',
      contextWindow: '128K',
      maxOutputTokens: '16K',
      quantization: 'API',
      supportsText: true,
      supportsImage: false,
      supportsReasoning: false,
    },
  ],
};

export const INITIAL_MODEL_PROVIDERS: ModelProviderConfig[] = [
  {
    id: 'prov-ollama-local',
    sourceType: 'builtin',
    builtinKey: 'ollama',
    displayName: 'Ollama (Local)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    protocol: 'openai-chat',
    authEnvVar: 'OLLAMA_API_TOKEN',
    isLocalRuntime: true,
    connectionStatus: 'connected',
    models: [
      {
        id: 'qwen3-14b-q4',
        modelId: 'qwen3:14b-q4',
        name: 'qwen3:14b-q4',
        provider: 'Ollama (Local)',
        providerId: 'prov-ollama-local',
        contextWindow: '32K',
        maxOutputTokens: '8K',
        quantization: 'Q4_K_M',
        supportsText: true,
        supportsImage: false,
        supportsReasoning: true,
      },
      {
        id: 'qwen2.5-7b-instruct',
        modelId: 'qwen2.5:7b-instruct',
        name: 'qwen2.5:7b-instruct',
        provider: 'Ollama (Local)',
        providerId: 'prov-ollama-local',
        contextWindow: '32K',
        maxOutputTokens: '8K',
        quantization: 'Q4_K_M',
        supportsText: true,
        supportsImage: false,
        supportsReasoning: false,
      },
      {
        id: 'llama3.1-8b-local',
        modelId: 'llama3.1:8b-local',
        name: 'llama3.1:8b-local',
        provider: 'Ollama (Local)',
        providerId: 'prov-ollama-local',
        contextWindow: '16K',
        maxOutputTokens: '4K',
        quantization: 'Q8_0',
        supportsText: true,
        supportsImage: false,
        supportsReasoning: false,
      },
    ],
  },
  {
    id: 'prov-vllm-internal',
    sourceType: 'builtin',
    builtinKey: 'vllm',
    displayName: 'vLLM (Nội bộ)',
    baseUrl: 'http://127.0.0.1:8000/v1',
    protocol: 'openai-chat',
    authEnvVar: 'VLLM_INTERNAL_TOKEN',
    connectionStatus: 'connected',
    models: [
      {
        id: 'qwen3.5-9b-office-rl-v2',
        modelId: 'Qwen/Qwen3.5-9B-Office-RL-v2',
        name: 'Qwen3.5-9B-Office-RL-v2',
        provider: 'vLLM (Nội bộ)',
        providerId: 'prov-vllm-internal',
        contextWindow: '32K',
        maxOutputTokens: '8K',
        quantization: 'FP8 + LoRA',
        supportsText: true,
        supportsImage: false,
        supportsReasoning: true,
        isRlTuned: true,
      },
      {
        id: 'qwen3.5-9b-base',
        modelId: 'Qwen/Qwen3.5-9B-Base',
        name: 'Qwen3.5-9B-Base',
        provider: 'vLLM (Nội bộ)',
        providerId: 'prov-vllm-internal',
        contextWindow: '32K',
        maxOutputTokens: '8K',
        quantization: 'FP8',
        supportsText: true,
        supportsImage: false,
        supportsReasoning: false,
      },
    ],
  },
  {
    id: 'prov-lmstudio',
    sourceType: 'builtin',
    builtinKey: 'lmstudio',
    displayName: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    protocol: 'openai-chat',
    authEnvVar: 'LMSTUDIO_LOCAL_TOKEN',
    connectionStatus: 'unconfigured',
    models: [
      {
        id: 'gemma-3-12b-it',
        modelId: 'gemma-3-12b-it',
        name: 'gemma-3-12b-it',
        provider: 'LM Studio',
        providerId: 'prov-lmstudio',
        contextWindow: '32K',
        maxOutputTokens: '8K',
        quantization: 'Q4_K_M',
        supportsText: true,
        supportsImage: true,
        supportsReasoning: false,
      },
    ],
  },
];

export const INITIAL_CALENDAR_EVENTS: CalendarEvent[] = [
  {
    id: 'evt-seed-1',
    projectId: 'proj-1',
    resourceId: 'res-p1-2',
    title: 'Rà soát phụ lục thanh toán với Minh Khôi',
    date: '2026-11-26',
    startTime: '09:30',
    endTime: '10:30',
    allDay: false,
    repeatSummary: 'Does not repeat',
    description: 'Chốt tiến độ giải ngân đợt 2 và điều khoản phạt chậm tiến độ.',
    reminderMinutes: 30,
    createdAt: '2026-11-23T08:30:00.000Z',
  },
];

export const INITIAL_MAILBOX_LABELS: MailboxLabel[] = [
  { id: 'lbl-hopdong-q4', name: 'HopDong-Q4', messageCount: 14, source: 'gmail' },
  { id: 'lbl-launch-2026', name: 'Launch-2026', messageCount: 9, source: 'gmail' },
  { id: 'lbl-audit-2026', name: 'Audit-2026', messageCount: 6, source: 'gmail' },
  { id: 'lbl-hr-ai-2026', name: 'HR-AI-2026', messageCount: 11, source: 'gmail' },
  { id: 'lbl-finance-monthly', name: 'Finance-Monthly', messageCount: 8, source: 'gmail' },
  { id: 'lbl-khachhang-vip', name: 'KhachHang-VIP', messageCount: 18, source: 'gmail' },
  { id: 'lbl-thietke-figma', name: 'ThietKe-Figma', messageCount: 12, source: 'gmail' },
  { id: 'lbl-dev-github', name: 'Dev-GitHub-Issues', messageCount: 23, source: 'gmail' },
  { id: 'lbl-marketing-q1', name: 'Marketing-Q1-2027', messageCount: 7, source: 'gmail' },
];

export const EXTRA_FETCHABLE_MAILBOX_LABELS: MailboxLabel[] = [
  { id: 'lbl-phapche-2027', name: 'PhapChe-2027', messageCount: 4, source: 'gmail' },
  { id: 'lbl-muasam-it', name: 'MuaSam-ThietBi', messageCount: 9, source: 'gmail' },
  { id: 'lbl-noibo-bgd', name: 'NoiBo-BanGiamDoc', messageCount: 5, source: 'gmail' },
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    title: 'Hợp đồng Đối tác Quý 4',
    icon: 'scale',
    createdAt: '2026-11-22T09:15:00.000Z',
    members: [
      { id: 'm-1', email: 'linh.pham@soviectech.vn', role: 'nội bộ' },
      { id: 'm-2', email: 'procurement.director@minhkhoicorp.vn', role: 'khách' },
      { id: 'm-3', email: 'legal.review@soviectech.vn', role: 'nội bộ' },
    ],
    config: {
      imapFolder: 'INBOX/HopDong-Q4',
      mailLabelId: 'lbl-hopdong-q4',
      mailLabelName: 'HopDong-Q4',
      defaultSummaryStyle: 'ý chính',
      mailSyncIntervalMinutes: 60,
      defaultReminderMinutes: 30,
      collectRlFeedback: true,
    },
    resources: [
      {
        id: 'res-p1-1',
        type: 'pdf',
        fileName: 'PhuLuc_HopDong_MinhKhoi_Q4.pdf',
        fileSize: '3,2 MB',
        pageCount: 24,
        isMapReduce: true,
        documentCode: '04/2026/PLHĐ-MK',
        issuedDate: '23-11-2026',
        pages: MOCK_PDF_MINH_KHOI_Q4,
        createdAt: '2026-11-23T14:20:00.000Z',
        selected: true,
        activeSummaryStyle: 'ý chính',
        summaryByStyle: {
          ngắn:
            'Phụ lục điều chỉnh giá trị gói triển khai lên **1,45 tỷ VNĐ** [tr. 3], chia 3 đợt thanh toán và bổ sung điều khoản bảo trì 12 tháng [tr. 18]. Cần ký xác nhận trước **28-11-2026**.',
          'ý chính':
            '### Điểm trọng yếu của Phụ lục Hợp đồng\n- **Giá trị & Thanh toán:** Tổng giá trị **1,45 tỷ VNĐ** (đã gồm VAT), thanh toán theo tỷ lệ `30% / 40% / 30%` trong vòng 10 ngày làm việc sau nghiệm thu [tr. 3–5].\n- **Cam kết SLA:** Thời gian phản hồi sự cố nghiêm trọng tối đa **2 giờ**; phạt chậm tiến độ `0,05%/ngày`, trần tối đa `8%` [tr. 12].\n- **Mốc bàn giao:** Nghiệm thu giai đoạn 1 vào **10-12-2026** và hoàn tất toàn bộ vào **25-12-2026** [tr. 19].',
          'gạch đầu dòng':
            '- Tổng giá trị điều chỉnh: 1,45 tỷ VNĐ [tr. 3].\n- Đợt 1 (30%): ngay sau ký phụ lục [tr. 4].\n- Đợt 2 (40%): sau nghiệm thu hạ tầng 10-12-2026 [tr. 5].\n- Đợt 3 (30%): sau bàn giao chính thức 25-12-2026 [tr. 5].\n- Rủi ro pháp lý: Điều 7.2 chưa nêu rõ ngoại lệ bất khả kháng từ phía hạ tầng bên thứ ba [tr. 14].',
        },
        solutions: [
          {
            id: 'sol-p1-1-a',
            titleMarkdown:
              '**Đề nghị bổ sung khoản ngoại lệ SLA tại Điều 7.2 & giữ nguyên lịch giải ngân**\n\nGửi bản dự thảo chỉnh sửa điều khoản bất khả kháng để khóa rủi ro phạt chậm tiến độ trước phiên ký ngày 28-11.',
            prosConsMarkdown:
              '- **Ưu điểm:** Bảo vệ trực tiếp biên lợi nhuận, không làm chậm đợt thanh toán 30% đầu tiên.\n- **Nhược điểm:** Cần pháp chế đối tác rà soát thêm 1–2 ngày làm việc.',
          },
          {
            id: 'sol-p1-1-b',
            titleMarkdown:
              '**Chấp thuận SLA hiện tại nhưng đàm phán tăng đệm mốc nghiệm thu thêm 5 ngày**\n\nGiữ nguyên văn bản pháp lý để ký nhanh, đổi lấy lùi hạn bàn giao giai đoạn 1 sang 15-12-2026.',
            prosConsMarkdown:
              '- **Ưu điểm:** Thủ tục ký rút gọn, giảm áp lực tiến độ cho đội kỹ thuật.\n- **Nhược điểm:** Dòng tiền đợt 2 về chậm hơn kế hoạch tài chính tháng 12.',
          },
        ],
        schedule: {
          title: 'Họp chốt phụ lục hợp đồng Minh Khôi Q4',
          date: '2026-11-26',
          startTime: '09:30',
          endTime: '10:30',
          allDay: false,
          repeat: 'Does not repeat',
          customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
          hasDeadline: true,
          deadlineDate: '2026-11-28',
          description:
            'Thống nhất Điều 7.2 và lịch giải ngân 3 đợt theo file PhuLuc_HopDong_MinhKhoi_Q4.pdf. Nhắc trước 30 phút.',
          isApproved: false,
        },
      },
      {
        id: 'res-p1-2',
        type: 'mail',
        senderEmail: 'procurement.director@minhkhoicorp.vn',
        senderRole: 'khách',
        subject: 'Xác nhận lịch rà soát điều khoản thanh toán đợt 2',
        folderName: 'INBOX/HopDong-Q4',
        hasPdfAttachment: true,
        createdAt: '2026-11-24T08:10:00.000Z',
        selected: true,
        activeSummaryStyle: 'ý chính',
        summaryByStyle: {
          ngắn:
            'Đối tác Minh Khôi đề xuất họp **09:30 ngày 26-11-2026** để chốt phương án bảo lãnh thanh toán đợt 2 và đính kèm bảng đối chiếu công nợ.',
          'ý chính':
            '### Tóm tắt Email từ Đối tác Minh Khôi\n- **Yêu cầu chính:** Xác nhận điều kiện giải ngân đợt 2 (`40%`) dựa trên biên bản nghiệm thu điện tử.\n- **Đề xuất lịch họp:** `09:30 – 10:30`, thứ Năm ngày **26-11-2026** tại phòng họp trực tuyến.\n- **Tệp đính kèm:** Đã tách bản PDF đối chiếu công nợ sang danh sách tài nguyên dự án.',
          'gạch đầu dòng':
            '- Người gửi: Giám đốc Mua hàng Minh Khôi (khách).\n- Mục tiêu: Thống nhất biên bản nghiệm thu đợt 2.\n- Đề xuất giờ họp: 26-11-2026, 09:30–10:30.\n- Lưu ý: Có xung đột với lịch rà soát hiện tại nếu không gộp phiên.',
        },
        solutions: [
          {
            id: 'sol-p1-2-a',
            titleMarkdown:
              '**Gộp chung phiên họp 09:30 ngày 26-11 và gửi trước danh mục điểm chốt**\n\nXác nhận tham gia cùng pháp chế và kế toán, đính kèm 3 câu hỏi trọng tâm để kết thúc trong 45 phút.',
            prosConsMarkdown:
              '- **Ưu điểm:** Tránh trùng lịch, tiết kiệm thời gian cho cả hai ban giám đốc.\n- **Nhược điểm:** Chương trình họp dày, cần người điều phối chặt.',
          },
          {
            id: 'sol-p1-2-b',
            titleMarkdown:
              '**Đề nghị dời sang 14:00 ngày 26-11 để rà soát nội bộ trước buổi sáng**\n\nGiữ nguyên phiên nội bộ lúc 09:30 và làm việc với đối tác vào đầu giờ chiều.',
            prosConsMarkdown:
              '- **Ưu điểm:** Đội nội bộ có đủ thời gian thống nhất phương án dự phòng.\n- **Nhược điểm:** Phụ thuộc lịch trống buổi chiều của phía đối tác.',
          },
        ],
        schedule: {
          title: 'Họp với Minh Khôi về thanh toán đợt 2',
          date: '2026-11-26',
          startTime: '14:00',
          endTime: '15:00',
          allDay: false,
          repeat: 'Does not repeat',
          customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
          hasDeadline: false,
          deadlineDate: '2026-11-27',
          description: 'Trao đổi trực tuyến với procurement.director@minhkhoicorp.vn về biên bản nghiệm thu đợt 2.',
          isApproved: false,
        },
      },
      {
        id: 'res-p1-3',
        type: 'pdf',
        fileName: 'BienBan_Scan_KyNhay_Thang10.pdf',
        fileSize: '5,8 MB',
        pageCount: 9,
        isOcr: true,
        documentCode: 'BBKS-10/2026-MK',
        issuedDate: '18-10-2026',
        pages: MOCK_PDF_BIEN_BAN_OCR,
        createdAt: '2026-11-16T11:00:00.000Z',
        selected: false,
        activeSummaryStyle: 'ý chính',
        summaryByStyle: {
          ngắn:
            'Bản scan đã chạy OCR xác nhận hai bên đã hoàn tất khảo sát hiện trường ngày 18-10-2026 và thống nhất danh mục 14 đầu việc bàn giao.',
          'ý chính':
            '### Tóm tắt Biên bản (OCR hoàn tất)\n- **Phạm vi:** 14 hạng mục triển khai phần mềm và đào tạo vận hành tại 3 chi nhánh [tr. 2–6].\n- **Xác nhận hiện trường:** Đã có chữ ký nháy của đại diện hai bên ngày **18-10-2026** [tr. 9].',
          'gạch đầu dòng':
            '- Loại tệp: PDF scan (đã qua OCR cục bộ).\n- Số hạng mục thống nhất: 14 đầu việc.\n- Thời điểm ký nháy: 18-10-2026.',
        },
        solutions: [
          {
            id: 'sol-p1-3-a',
            titleMarkdown:
              '**Dùng biên bản ký nháy làm phụ lục tham chiếu chính thức**\n\nĐánh số phụ lục 01B gắn vào hợp đồng chính để tránh phải khảo sát lại.',
            prosConsMarkdown:
              '- **Ưu điểm:** Giảm 100% thời gian lập lại bảng phạm vi.\n- **Nhược điểm:** Cần rà lại 2 mục viết tay ở trang 7 cho rõ chữ.',
          },
          {
            id: 'sol-p1-3-b',
            titleMarkdown:
              '**Chuyển hóa bảng 14 đầu việc sang văn bản đánh máy ký số**\n\nXuất bảng sạch từ kết quả OCR để cả hai bên ký điện tử đồng bộ.',
            prosConsMarkdown:
              '- **Ưu điểm:** Rõ ràng tuyệt đối khi kiểm toán sau này.\n- **Nhược điểm:** Mất thêm khoảng 1 giờ biên tập và đối chiếu.',
          },
        ],
        schedule: {
          title: 'Đối chiếu 14 hạng mục ký nháy trước nghiệm thu',
          date: '2026-12-01',
          startTime: '10:00',
          endTime: '11:00',
          allDay: false,
          repeat: 'Weekly on Wednesday',
          customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
          hasDeadline: true,
          deadlineDate: '2026-12-08',
          description: 'Kiểm tra tiến độ 14 hạng mục theo BienBan_Scan_KyNhay_Thang10.pdf.',
          isApproved: false,
        },
      },
      {
        id: 'res-p1-4',
        type: 'mail',
        senderEmail: 'linh.pham@soviectech.vn',
        senderRole: 'nội bộ',
        subject: 'Góp ý pháp chế về mức trần phạt hợp đồng Q4',
        folderName: 'INBOX/HopDong-Q4',
        createdAt: '2026-11-15T16:40:00.000Z',
        selected: false,
        activeSummaryStyle: 'ý chính',
        summaryByStyle: {
          ngắn:
            'Pháp chế nội bộ lưu ý trần phạt `8%` là hợp lệ theo Luật Thương mại, nhưng đề nghị tách riêng thời gian chờ dữ liệu từ khách hàng khỏi thời gian tính chậm.',
          'ý chính':
            '### Góp ý từ Pháp chế Nội bộ\n- Mức phạt `0,05%/ngày` và trần `8%` phù hợp khung quy định hiện hành.\n- Cần bổ sung câu: *"Thời gian chờ phản hồi hoặc cấp quyền từ Bên A không tính vào tiến độ của Bên B"*.',
          'gạch đầu dòng':
            '- Trần phạt 8%: đạt chuẩn.\n- Kiến nghị bổ sung: loại trừ thời gian chờ Bên A.\n- Cần hoàn tất chỉnh sửa trước khi gửi bản chốt.',
        },
        solutions: [
          {
            id: 'sol-p1-4-a',
            titleMarkdown:
              '**Chèn trực tiếp điều khoản loại trừ thời gian chờ Bên A**\n\nCập nhật ngay vào bản thảo v3 gửi Minh Khôi trong ngày hôm nay.',
            prosConsMarkdown:
              '- **Ưu điểm:** Công bằng, dễ được đối tác đồng thuận ngay.\n- **Nhược điểm:** Cần thống nhất định nghĩa "thời gian phản hồi hợp lệ".',
          },
          {
            id: 'sol-p1-4-b',
            titleMarkdown:
              '**Thêm phụ lục ma trận RACI quy định hạn phản hồi từng đầu mối**\n\nGắn trách nhiệm phản hồi tối đa 48 giờ cho mỗi hạng mục nghiệm thu.',
            prosConsMarkdown:
              '- **Ưu điểm:** Minh bạch đầu mối khi có tranh chấp tiến độ.\n- **Nhược điểm:** Thêm 1 trang phụ lục cần ký kèm.',
          },
        ],
        schedule: {
          title: 'Rà soát bản thảo v3 cùng Pháp chế',
          date: '2026-11-25',
          startTime: '15:00',
          endTime: '15:45',
          allDay: false,
          repeat: 'Does not repeat',
          customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
          hasDeadline: false,
          deadlineDate: '2026-11-26',
          description: 'Chốt câu chữ điều khoản loại trừ thời gian chờ dữ liệu với linh.pham@soviectech.vn.',
          isApproved: false,
        },
      },
    ],
  },
  {
    id: 'proj-2',
    title: 'Kế hoạch Ra mắt Sản phẩm',
    icon: 'rocket',
    createdAt: '2026-11-20T10:30:00.000Z',
    members: [
      { id: 'm-4', email: 'hoang.tran@soviectech.vn', role: 'nội bộ' },
      { id: 'm-5', email: 'media.partner@sangatagency.vn', role: 'khách' },
    ],
    config: {
      imapFolder: 'INBOX/Launch-2026',
      mailLabelId: 'lbl-launch-2026',
      mailLabelName: 'Launch-2026',
      defaultSummaryStyle: 'gạch đầu dòng',
      mailSyncIntervalMinutes: 30,
      defaultReminderMinutes: 15,
      collectRlFeedback: true,
    },
    resources: [
      {
        id: 'res-p2-1',
        type: 'pdf',
        fileName: 'KeHoach_TruyenThong_RaMat_V2.pdf',
        fileSize: '1,9 MB',
        pageCount: 14,
        documentCode: 'KH-RM-2026-V2',
        issuedDate: '23-11-2026',
        pages: MOCK_PDF_LAUNCH_V2,
        createdAt: '2026-11-23T09:00:00.000Z',
        selected: true,
        activeSummaryStyle: 'ý chính',
        summaryByStyle: {
          ngắn:
            'Kế hoạch ra mắt ngày **12-12-2026** với ngân sách **320 triệu VNĐ**, tập trung vào hội thảo khách hàng doanh nghiệp và chuỗi demo trực tiếp.',
          'ý chính':
            '### Kế hoạch Truyền thông Ra mắt\n- **Ngày sự kiện:** **12-12-2026** tại Hà Nội & livestream toàn quốc [tr. 2].\n- **Ngân sách dự kiến:** `320 triệu VNĐ` (55% sự kiện, 30% nội dung kỹ thuật, 15% dự phòng) [tr. 9].\n- **Mục tiêu:** 150 khách mời doanh nghiệp và 40 lịch demo sau sự kiện [tr. 4].',
          'gạch đầu dòng':
            '- Thời điểm ra mắt: 12-12-2026 [tr. 2].\n- Tổng ngân sách: 320 triệu VNĐ [tr. 9].\n- Hạn khóa danh sách khách mời: 03-12-2026 [tr. 6].',
        },
        solutions: [
          {
            id: 'sol-p2-1-a',
            titleMarkdown:
              '**Tổ chức buổi chạy thử kỹ thuật trước 48 giờ**\n\nKiểm tra toàn bộ kịch bản demo Local LLM ngoại tuyến để loại bỏ rủi ro đường truyền tại hội trường.',
            prosConsMarkdown:
              '- **Ưu điểm:** Đảm bảo demo mượt 100%, tăng độ tin cậy với khách doanh nghiệp.\n- **Nhược điểm:** Chiếm thêm 1 buổi của đội kỹ thuật sản phẩm.',
          },
          {
            id: 'sol-p2-1-b',
            titleMarkdown:
              '**Chuẩn bị thêm bộ video dự phòng cho từng tính năng cốt lõi**\n\nQuay sẵn luồng xử lý tài liệu dài để trình chiếu khi cần rút ngắn thời lượng hỏi đáp.',
            prosConsMarkdown:
              '- **Ưu điểm:** Chủ động kiểm soát thời lượng chương trình.\n- **Nhược điểm:** Tốn công biên tập trước ngày 08-12.',
          },
        ],
        schedule: {
          title: 'Tổng duyệt kịch bản ra mắt sản phẩm',
          date: '2026-12-10',
          startTime: '14:00',
          endTime: '16:30',
          allDay: false,
          repeat: 'Does not repeat',
          customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
          hasDeadline: true,
          deadlineDate: '2026-12-12',
          description: 'Chạy thử demo và kiểm tra thiết bị hội trường cùng agency.',
          isApproved: false,
        },
      },
      {
        id: 'res-p2-2',
        type: 'mail',
        senderEmail: 'media.partner@sangatagency.vn',
        senderRole: 'khách',
        subject: 'Báo giá cập nhật hạng mục sân khấu & livestream',
        folderName: 'INBOX/Launch-2026',
        createdAt: '2026-11-22T15:20:00.000Z',
        selected: true,
        activeSummaryStyle: 'ý chính',
        summaryByStyle: {
          ngắn:
            'Agency gửi báo giá cập nhật **172 triệu VNĐ** (giảm 8 triệu so với bản 1), cần xác nhận đặt cọc trước **30-11-2026** để giữ hội trường.',
          'ý chính':
            '### Cập nhật Báo giá từ Agency\n- Tổng hạng mục sân khấu & livestream: **172 triệu VNĐ** (trong hạn mức 55% ngân sách).\n- Hạn xác nhận giữ địa điểm: **30-11-2026**.',
          'gạch đầu dòng':
            '- Chi phí mới: 172 triệu VNĐ (-8 triệu).\n- Hạn đặt cọc giữ sảnh: 30-11-2026.',
        },
        solutions: [
          {
            id: 'sol-p2-2-a',
            titleMarkdown:
              '**Chốt báo giá 172 triệu và yêu cầu gắn cam kết đường truyền dự phòng 4G/5G**\n\nKý xác nhận trong tuần này để giữ sảnh trung tâm.',
            prosConsMarkdown:
              '- **Ưu điểm:** Tiết kiệm 8 triệu và giữ đúng vị trí đẹp.\n- **Nhược điểm:** Cần trình duyệt tạm ứng trong 3 ngày.',
          },
          {
            id: 'sol-p2-2-b',
            titleMarkdown:
              '**So sánh thêm 1 đơn vị livestream độc lập để tối ưu thêm 10%**\n\nTách gói thuê sảnh và gói kỹ thuật quay phát.',
            prosConsMarkdown:
              '- **Ưu điểm:** Có thể hạ chi phí xuống quanh 155 triệu.\n- **Nhược điểm:** Tăng đầu mối phối hợp trong ngày sự kiện.',
          },
        ],
        schedule: {
          title: 'Chốt báo giá & ký giữ sảnh sự kiện',
          date: '2026-11-28',
          startTime: '10:00',
          endTime: '11:00',
          allDay: false,
          repeat: 'Does not repeat',
          customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
          hasDeadline: true,
          deadlineDate: '2026-11-30',
          description: 'Xác nhận báo giá 172 triệu với media.partner@sangatagency.vn.',
          isApproved: false,
        },
      },
    ],
  },
  {
    id: 'proj-3',
    title: 'Kiểm toán Nội bộ 2026',
    icon: 'shield-check',
    createdAt: '2026-11-18T14:00:00.000Z',
    members: [
      { id: 'm-6', email: 'audit.lead@soviectech.vn', role: 'nội bộ' },
      { id: 'm-7', email: 'compliance.ext@vnassurance.vn', role: 'khách' },
    ],
    config: {
      imapFolder: 'INBOX/Audit-2026',
      mailLabelId: 'lbl-audit-2026',
      mailLabelName: 'Audit-2026',
      defaultSummaryStyle: 'ý chính',
      mailSyncIntervalMinutes: 120,
      defaultReminderMinutes: 30,
      collectRlFeedback: true,
    },
    resources: [
      {
        id: 'res-p3-1',
        type: 'pdf',
        fileName: 'DanhMuc_HoSo_KiemToan_2026.pdf',
        fileSize: '4,1 MB',
        pageCount: 38,
        isMapReduce: true,
        documentCode: 'KTNB-2026-DM27',
        issuedDate: '19-11-2026',
        pages: MOCK_PDF_AUDIT_2026,
        createdAt: '2026-11-19T08:45:00.000Z',
        selected: true,
        activeSummaryStyle: 'ý chính',
        summaryByStyle: {
          ngắn:
            'Danh mục gồm 27 nhóm chứng từ cần nộp trước **05-12-2026**, trọng tâm vào kiểm soát truy cập dữ liệu và chứng từ chi phí phần mềm.',
          'ý chính':
            '### Danh mục Kiểm toán 2026\n- **Tổng số hồ sơ:** 27 nhóm chứng từ thuộc Tài chính, Nhân sự và CNTT [tr. 1–4].\n- **Điểm ưu tiên cao:** Nhật ký phân quyền truy cập dữ liệu nội bộ và biên bản sao lưu định kỳ [tr. 22–28].',
          'gạch đầu dòng':
            '- Hạn bàn giao hồ sơ: 05-12-2026.\n- 3 phòng ban phối hợp: Tài chính, Nhân sự, CNTT.\n- Kiểm tra thực địa: 09-12 đến 11-12-2026.',
        },
        solutions: [
          {
            id: 'sol-p3-1-a',
            titleMarkdown:
              '**Lập bảng theo dõi tập trung theo 3 đầu mối phòng ban**\n\nChia 27 hồ sơ theo hạn chót nội bộ ngày 02-12 để có 3 ngày rà soát chéo trước khi gửi đoàn kiểm toán.',
            prosConsMarkdown:
              '- **Ưu điểm:** Phát hiện thiếu chứng từ sớm, không bị dồn sát ngày nộp.\n- **Nhược điểm:** Cần họp điểm nhanh 15 phút mỗi sáng thứ Tư.',
          },
          {
            id: 'sol-p3-1-b',
            titleMarkdown:
              '**Nộp cuốn chiếu từng nhóm hồ sơ đã hoàn tất**\n\nChuyển trước nhóm Tài chính để đoàn kiểm toán bắt đầu rà soát sớm.',
            prosConsMarkdown:
              '- **Ưu điểm:** Giảm áp lực giải trình dồn vào tuần kiểm tra thực địa.\n- **Nhược điểm:** Cần quản lý chặt phiên bản tài liệu đã gửi.',
          },
        ],
        schedule: {
          title: 'Họp rà soát chứng từ kiểm toán nội bộ',
          date: '2026-12-02',
          startTime: '09:00',
          endTime: '10:00',
          allDay: false,
          repeat: 'Weekly on Wednesday',
          customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
          hasDeadline: true,
          deadlineDate: '2026-12-05',
          description: 'Kiểm tra tiến độ 27 nhóm chứng từ cùng audit.lead@soviectech.vn.',
          isApproved: false,
        },
      },
    ],
  },
  {
    id: 'proj-4',
    title: 'Tuyển dụng Kỹ sư AI',
    icon: 'users',
    createdAt: '2026-11-12T08:20:00.000Z',
    members: [
      { id: 'm-8', email: 'talent.acquisition@soviectech.vn', role: 'nội bộ' },
    ],
    config: {
      imapFolder: 'INBOX/HR-AI-2026',
      mailLabelId: 'lbl-hr-ai-2026',
      mailLabelName: 'HR-AI-2026',
      defaultSummaryStyle: 'ngắn',
      mailSyncIntervalMinutes: 240,
      defaultReminderMinutes: 15,
      collectRlFeedback: false,
    },
    resources: [
      {
        id: 'res-p4-1',
        type: 'mail',
        senderEmail: 'talent.acquisition@soviectech.vn',
        senderRole: 'nội bộ',
        subject: 'Tổng hợp 6 hồ sơ vòng phỏng vấn kỹ thuật tuần này',
        folderName: 'INBOX/HR-AI-2026',
        createdAt: '2026-11-21T11:30:00.000Z',
        selected: true,
        activeSummaryStyle: 'ngắn',
        summaryByStyle: {
          ngắn:
            'Đã lọc được 6 ứng viên đạt yêu cầu về Python & tối ưu inference local (vLLM/Ollama), đề xuất xếp lịch phỏng vấn từ **25-11 đến 27-11**.',
          'ý chính':
            '### Danh sách Vòng Kỹ thuật\n- **Số lượng:** 6 ứng viên (4 Senior, 2 Middle).\n- **Thế mạnh nổi bật:** 3 ứng viên có kinh nghiệm triển khai QLoRA và tối ưu KV-cache.',
          'gạch đầu dòng':
            '- 6 ứng viên đạt vòng CV.\n- Đề xuất phỏng vấn: 25-11 đến 27-11.\n- Cần chốt hội đồng phỏng vấn kỹ thuật.',
        },
        solutions: [
          {
            id: 'sol-p4-1-a',
            titleMarkdown:
              '**Gom lịch phỏng vấn theo 2 khung cố định chiều thứ Ba và thứ Năm**\n\nMỗi phiên 45 phút với bộ bài đánh giá chuẩn hóa giúp so sánh ứng viên công bằng.',
            prosConsMarkdown:
              '- **Ưu điểm:** Không cắt vụn thời gian làm việc sâu của nhóm kỹ thuật.\n- **Nhược điểm:** Cần báo sớm để ứng viên sắp xếp lịch.',
          },
          {
            id: 'sol-p4-1-b',
            titleMarkdown:
              '**Gửi bài tập ngắn 60 phút trước buổi phỏng vấn trực tiếp**\n\nSàng lọc nhanh năng lực thiết kế schema và xử lý lỗi thực tế.',
            prosConsMarkdown:
              '- **Ưu điểm:** Rút ngắn thời gian phỏng vấn trực tiếp.\n- **Nhược điểm:** Một số ứng viên Senior có thể ngại làm bài trước.',
          },
        ],
        schedule: {
          title: 'Phỏng vấn kỹ thuật ứng viên AI (Đợt 1)',
          date: '2026-11-27',
          startTime: '14:00',
          endTime: '16:30',
          allDay: false,
          repeat: 'Does not repeat',
          customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
          hasDeadline: false,
          deadlineDate: '2026-11-29',
          description: 'Phỏng vấn 3 ứng viên đầu tiên theo danh sách HR.',
          isApproved: false,
        },
      },
    ],
  },
  {
    id: 'proj-5',
    title: 'Tổng hợp Báo cáo Tài chính',
    icon: 'calculator',
    createdAt: '2026-11-05T16:45:00.000Z',
    members: [
      { id: 'm-9', email: 'cfo.office@soviectech.vn', role: 'nội bộ' },
    ],
    config: {
      imapFolder: 'INBOX/Finance-Monthly',
      mailLabelId: 'lbl-finance-monthly',
      mailLabelName: 'Finance-Monthly',
      defaultSummaryStyle: 'ý chính',
      mailSyncIntervalMinutes: 360,
      defaultReminderMinutes: 30,
      collectRlFeedback: true,
    },
    resources: [
      {
        id: 'res-p5-1',
        type: 'pdf',
        fileName: 'BaoCao_DongTien_Thang10_2026.pdf',
        fileSize: '1,4 MB',
        pageCount: 11,
        documentCode: 'BCTC-DT-102026',
        issuedDate: '10-11-2026',
        pages: MOCK_PDF_FINANCE_T10,
        createdAt: '2026-11-10T10:15:00.000Z',
        selected: true,
        activeSummaryStyle: 'ý chính',
        summaryByStyle: {
          ngắn:
            'Dòng tiền thuần tháng 10 đạt dương **+2,1 tỷ VNĐ**, chi phí hạ tầng máy chủ giảm **18%** sau khi chuyển các tác vụ tóm tắt sang mô hình cục bộ.',
          'ý chính':
            '### Điểm sáng Dòng tiền Tháng 10\n- **Dòng tiền thuần:** `+2,1 tỷ VNĐ` (vượt kế hoạch 12%) [tr. 2].\n- **Tiết kiệm vận hành:** Chi phí API giảm `18%` nhờ triển khai Local LLM nội bộ [tr. 7].\n- **Công nợ phải thu:** Còn 2 khoản quá hạn >15 ngày cần nhắc thu trước 30-11 [tr. 10].',
          'gạch đầu dòng':
            '- Dòng tiền thuần: +2,1 tỷ VNĐ.\n- Chi phí API giảm 18%.\n- 2 khoản công nợ cần đối chiếu trước 30-11.',
        },
        solutions: [
          {
            id: 'sol-p5-1-a',
            titleMarkdown:
              '**Gửi thư đối chiếu công nợ tự động kèm bảng kê chi tiết**\n\nƯu tiên 2 khoản quá hạn trên 15 ngày trong tuần này.',
            prosConsMarkdown:
              '- **Ưu điểm:** Cải thiện dòng tiền ngay trước chốt sổ tháng 11.\n- **Nhược điểm:** Cần kế toán xác nhận số dư thực tế trước khi gửi.',
          },
          {
            id: 'sol-p5-1-b',
            titleMarkdown:
              '**Tái phân bổ phần tiết kiệm API sang nâng cấp bộ nhớ GPU nội bộ**\n\nGiữ nguyên tổng ngân sách CNTT nhưng tăng tốc độ xử lý PDF đồng thời.',
            prosConsMarkdown:
              '- **Ưu điểm:** Tăng hiệu suất cho toàn bộ khối văn phòng.\n- **Nhược điểm:** Chi đầu tư ban đầu tập trung vào tháng 12.',
          },
        ],
        schedule: {
          title: 'Họp chốt số liệu tài chính tháng 11',
          date: '2026-11-30',
          startTime: '16:00',
          endTime: '17:00',
          allDay: false,
          repeat: 'Monthly on the last Wednesday',
          customRepeat: { ...DEFAULT_CUSTOM_RECURRENCE },
          hasDeadline: true,
          deadlineDate: '2026-12-02',
          description: 'Đối chiếu công nợ và ngân sách vận hành cùng CFO.',
          isApproved: false,
        },
      },
    ],
  },
];

export const INITIAL_CHAT_SESSIONS: ChatSession[] = [
  {
    id: 'sess-1',
    projectId: 'proj-1',
    title: 'So sánh rủi ro Điều 7.2 phụ lục Q4',
    updatedAt: '2026-11-24T08:40:00.000Z',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content:
          'Từ phụ lục hợp đồng Minh Khôi và email mới nhất, điểm nào cần chốt gấp nhất trước ngày 28-11?',
        timestamp: '2026-11-24T08:38:00.000Z',
      },
      {
        id: 'msg-2',
        role: 'agent',
        reasoning:
          '1. Đọc 2 nguồn đang chọn: PhuLuc_HopDong_MinhKhoi_Q4.pdf (24 trang) và email từ procurement.director@minhkhoicorp.vn.\n2. Đối chiếu Điều 7.2 (tr. 14) về mức phạt chậm 0,05%/ngày với góp ý pháp chế nội bộ.\n3. Kiểm tra lịch hiện có trong dự án: phát hiện phiên 09:30 ngày 26-11 trùng khung giờ đề xuất của đối tác.',
        reasoningDurationSec: 1.6,
        content:
          'Có **3 điểm cần chốt trước 28-11-2026** dựa trên tài liệu đã chọn:\n\n1. **Điều 7.2 về ngoại lệ SLA [tr. 14]:** Bổ sung quy định thời gian chờ phản hồi hoặc cấp quyền từ phía đối tác không tính vào thời gian chậm tiến độ (mức phạt hiện tại `0,05%/ngày`, trần `8%` [tr. 12]).\n2. **Điều kiện giải ngân đợt 2 (`40%` = 580 triệu VNĐ [tr. 5]):** Thống nhất chấp nhận biên bản nghiệm thu điện tử trên tổng giá trị gói `1,45 tỷ VNĐ` [tr. 3] trước mốc bàn giao Giai đoạn 1 ngày **10-12-2026** [tr. 19].\n3. **Khung giờ họp ngày 26-11:** Email đề xuất `09:30 – 10:30` đang trùng lịch nội bộ hiện có — bạn có thể mở tab **Đặt lịch** ở khung Tài nguyên để gộp phiên hoặc dời sang `14:00`.',
        timestamp: '2026-11-24T08:38:02.000Z',
        referencedSourceNames: [
          'PhuLuc_HopDong_MinhKhoi_Q4.pdf',
          'Xác nhận lịch rà soát điều khoản thanh toán đợt 2',
        ],
        feedback: null,
      },
    ],
  },
  {
    id: 'sess-2',
    projectId: 'proj-2',
    title: 'Đánh giá báo giá sân khấu 172 triệu',
    updatedAt: '2026-11-23T15:10:00.000Z',
    messages: [
      {
        id: 'msg-3',
        role: 'user',
        content: 'Báo giá 172 triệu của agency có nằm trong trần ngân sách kế hoạch không?',
        timestamp: '2026-11-23T15:09:00.000Z',
      },
      {
        id: 'msg-4',
        role: 'agent',
        reasoning:
          '1. Trích xuất ngân sách kế hoạch từ KeHoach_TruyenThong_RaMat_V2.pdf (tr. 9): 320 triệu VNĐ, hạng mục sự kiện chiếm 55% = 176 triệu VNĐ.\n2. So sánh với báo giá email mới nhất: 172 triệu VNĐ (thấp hơn trần 4 triệu VNĐ).',
        reasoningDurationSec: 1.1,
        content:
          '**Có, nằm trong hạn mức.** Hạng mục sự kiện được phân bổ tối đa **176 triệu VNĐ** (`55%` của `320 triệu VNĐ` `[tr. 9]`), nên báo giá **172 triệu VNĐ** hiện thấp hơn trần **4 triệu VNĐ**.\n\nBạn chỉ cần lưu ý hạn xác nhận giữ địa điểm là **30-11-2026**.',
        timestamp: '2026-11-23T15:09:02.000Z',
        referencedSourceNames: ['KeHoach_TruyenThong_RaMat_V2.pdf'],
        feedback: 'up',
      },
    ],
  },
  {
    id: 'sess-3',
    projectId: 'proj-3',
    title: 'Lịch nộp 27 nhóm chứng từ kiểm toán',
    updatedAt: '2026-11-21T09:12:00.000Z',
    messages: [
      {
        id: 'msg-5',
        role: 'user',
        content: 'Tóm tắt các mốc kiểm toán quan trọng cần nhớ trong tháng 12.',
        timestamp: '2026-11-21T09:11:00.000Z',
      },
      {
        id: 'msg-6',
        role: 'agent',
        reasoning:
          '1. Đọc DanhMuc_HoSo_KiemToan_2026.pdf (tr. 1–4 & tr. 22–28).\n2. Sắp xếp các mốc thời gian theo thứ tự tăng dần.',
        reasoningDurationSec: 0.9,
        content:
          '- **02-12-2026:** Khuyến nghị chốt rà soát nội bộ giữa 3 phòng ban.\n- **05-12-2026:** Hạn cuối bàn giao đủ 27 nhóm chứng từ `[tr. 2]`.\n- **09-12 đến 11-12-2026:** Kiểm tra thực địa và phỏng vấn quy trình phân quyền CNTT `[tr. 24]`.',
        timestamp: '2026-11-21T09:11:02.000Z',
        referencedSourceNames: ['DanhMuc_HoSo_KiemToan_2026.pdf'],
        feedback: null,
      },
    ],
  },
];

export const SYNCABLE_MOCK_EMAILS = [
  {
    senderEmail: 'ketoan.truong@soviectech.vn',
    senderRole: 'nội bộ' as const,
    subject: 'Xác nhận hạn mức thanh toán đợt 1 & đối chiếu thuế VAT',
    summaryShort:
      'Kế toán trưởng xác nhận sẵn sàng giải ngân đợt 1 ngay khi có bản phụ lục ký số và hóa đơn điện tử hợp lệ.',
    summaryKey:
      '### Phản hồi từ Phòng Kế toán\n- Hạn mức thanh toán đợt 1 (`30%` = `435 triệu VNĐ`) đã được phê duyệt.\n- Đề nghị bổ sung mã số thuế cập nhật của bên bán trước khi xuất hóa đơn.',
    scheduleTitle: 'Hoàn tất hồ sơ thanh toán đợt 1 với Kế toán',
    scheduleDate: '2026-11-29',
    scheduleStart: '10:30',
    scheduleEnd: '11:15',
  },
  {
    senderEmail: 'operations.lead@minhkhoicorp.vn',
    senderRole: 'khách' as const,
    subject: 'Gửi danh sách đầu mối kỹ thuật triển khai chi nhánh miền Nam',
    summaryShort:
      'Đối tác cung cấp 3 đầu mối kỹ thuật phụ trách nghiệm thu hạ tầng tại TP.HCM và đề nghị họp khởi động ngày 03-12.',
    summaryKey:
      '### Danh sách Đầu mối Kỹ thuật Đối tác\n- 3 kỹ sư hạ tầng phụ trách tiếp nhận bàn giao giai đoạn 1.\n- Đề nghị buổi họp khởi động kỹ thuật vào **03-12-2026 lúc 15:00**.',
    scheduleTitle: 'Họp khởi động kỹ thuật chi nhánh miền Nam',
    scheduleDate: '2026-12-03',
    scheduleStart: '15:00',
    scheduleEnd: '16:00',
  },
];
