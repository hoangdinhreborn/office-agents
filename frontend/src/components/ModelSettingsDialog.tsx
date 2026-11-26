import { discoverModels } from '../lib/llm-api';
import {
  IconAdjustmentsHorizontal,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCpu,
  IconHistory,
  IconLoader2,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { BUILTIN_PROVIDER_PRESETS } from '../data/seedData';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type {
  ApiProtocol,
  ModelItem,
  ModelProviderConfig,
  ProviderSourceType,
} from '../types/workspace';

interface ModelSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const PROTOCOL_OPTIONS: { value: ApiProtocol; label: string }[] = [
  { value: 'openai-chat', label: 'OpenAI Chat Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'ollama-native', label: 'Ollama Native API' },
];

interface FetchedModelCandidate {
  modelId: string;
  name: string;
  contextWindow: string;
  maxOutputTokens: string;
  quantization: string;
  supportsText: boolean;
  supportsImage: boolean;
  supportsReasoning: boolean;
  isRlTuned?: boolean;
}

function protocolLabel(protocol: ApiProtocol): string {
  return PROTOCOL_OPTIONS.find((p) => p.value === protocol)?.label ?? protocol;
}

function createBlankModel(providerName: string, providerId: string): ModelItem {
  return {
    id: `model-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    modelId: '',
    name: '',
    provider: providerName,
    providerId,
    contextWindow: '',
    maxOutputTokens: '',
    quantization: 'API',
    supportsText: true,
    supportsImage: false,
    supportsReasoning: false,
  };
}

function buildPresetModels(_builtinKey: string, displayName: string, providerId: string): ModelItem[] {
  return [createBlankModel(displayName, providerId)];
}

async function fetchModelsFromProvider(provider: ModelProviderConfig): Promise<{ models: FetchedModelCandidate[]; note: string }> {
  const models = await discoverModels(provider);
  return { models: models.map((m) => ({ modelId: m.model_id, name: m.name,
    contextWindow: '', maxOutputTokens: '', quantization: '', supportsText: true, supportsImage: false, supportsReasoning: false })),
    note: `Đã tải ${models.length} model từ provider. Capability và giới hạn token cần cấu hình theo model thực tế.` };
}

export function ModelSettingsDialog({ open, onClose }: ModelSettingsDialogProps) {
  const modelProviders = useWorkspaceStore((s) => s.modelProviders);
  const localLlmConfig = useWorkspaceStore((s) => s.localLlmConfig);
  const upsertModelProvider = useWorkspaceStore((s) => s.upsertModelProvider);
  const deleteModelProvider = useWorkspaceStore((s) => s.deleteModelProvider);
  const setProviderConnectionStatus = useWorkspaceStore((s) => s.setProviderConnectionStatus);
  const updateLocalLlmConfig = useWorkspaceStore((s) => s.updateLocalLlmConfig);
  const rollbackRlAdapter = useWorkspaceStore((s) => s.rollbackRlAdapter);
  const addToast = useWorkspaceStore((s) => s.addToast);

  // Top-level dialog view: 'list' (Screenshots 1 & 7) vs 'form' (Screenshots 2, 3, 5, 6)
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [topTab, setTopTab] = useState<'api' | 'local'>('api');

  // Local runtime quick test & fallback draft
  const [testingLocalId, setTestingLocalId] = useState<string | null>(null);
  const [fallbackDraft, setFallbackDraft] = useState(localLlmConfig.quantizationFallback);

  // Provider Add/Edit form draft
  const [draft, setDraft] = useState<ModelProviderConfig | null>(null);
  const [customSettingsOpen, setCustomSettingsOpen] = useState(false);
  const [testingFormConnection, setTestingFormConnection] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [formTestResult, setFormTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Fetch Models Picker Modal state (Screenshot 4)
  const [fetchModalOpen, setFetchModalOpen] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<FetchedModelCandidate[]>([]);
  const [fetchNote, setFetchNote] = useState<string>('');
  const [fetchSearch, setFetchSearch] = useState('');
  const [selectedFetchedIds, setSelectedFetchedIds] = useState<Set<string>>(new Set());

  const localRuntimeProvider = useMemo(() => modelProviders.find((p) => p.isLocalRuntime) ?? null, [modelProviders]);
  const apiProviders = modelProviders;
  const fallbackModels = modelProviders.filter((p) => p.isLocalRuntime).flatMap((p) => p.models);

  useEffect(() => {
    if (!open) {
      setDraft(null);
    } else {
      setViewMode('list');
      setFallbackDraft(localLlmConfig.quantizationFallback);
      setFormTestResult(null);
      setFetchModalOpen(false);
    }
  }, [open, localLlmConfig.quantizationFallback]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (fetchModalOpen) {
        setFetchModalOpen(false);
      } else if (viewMode === 'form') {
        setViewMode('list');
        setDraft(null);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, fetchModalOpen, viewMode, onClose]);

  const openAddProviderForm = () => {
    const id = `prov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDraft({ id, sourceType: 'custom', displayName: 'Endpoint tùy chỉnh', baseUrl: '', protocol: 'openai-chat',
      authMode: 'api-key', authEnvVar: '', apiKey: '', isLocalRuntime: false, connectionStatus: 'unconfigured',
      models: [createBlankModel('Endpoint tùy chỉnh', id)] });
    setCustomSettingsOpen(true);
    setFormTestResult(null);
    setViewMode('form');
  };

  const openEditProviderForm = (provider: ModelProviderConfig) => {
    setDraft({
      ...provider,
      models: provider.models.map((m) => ({ ...m })),
    });
    setCustomSettingsOpen(true);
    setFormTestResult(null);
    setViewMode('form');
  };

  const handleSwitchSourceType = (nextType: ProviderSourceType) => {
    setDraft((prev) => {
      if (!prev || prev.sourceType === nextType) return prev;
      if (nextType === 'custom') {
        return {
          ...prev,
          sourceType: 'custom',
          displayName: prev.displayName || 'Custom LLM API',
          baseUrl: prev.baseUrl || 'http://127.0.0.1:2455/v1',
          models:
            prev.models.length > 0
              ? prev.models
              : [createBlankModel(prev.displayName || 'Custom LLM API', prev.id)],
        };
      }
      const preset =
        BUILTIN_PROVIDER_PRESETS.find((p) => p.key === prev.builtinKey) ??
        BUILTIN_PROVIDER_PRESETS[0];
      return {
        ...prev,
        sourceType: 'builtin',
        builtinKey: preset.key,
        isLocalRuntime: ['ollama', 'vllm', 'lmstudio'].includes(preset.key),
        displayName: preset.defaultDisplayName,
        baseUrl: preset.defaultBaseUrl,
        protocol: preset.defaultProtocol,
        authEnvVar: preset.defaultAuthEnvVar,
        authMode: ['ollama', 'vllm', 'lmstudio'].includes(preset.key) ? 'none' : 'api-key',
        apiKey: '',
      };
    });
    setFormTestResult(null);
  };

  const handleSelectBuiltinPreset = (presetKey: string) => {
    const preset = BUILTIN_PROVIDER_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        builtinKey: preset.key,
        isLocalRuntime: ['ollama', 'vllm', 'lmstudio'].includes(preset.key),
        displayName: preset.defaultDisplayName,
        baseUrl: preset.defaultBaseUrl,
        protocol: preset.defaultProtocol,
        authEnvVar: preset.defaultAuthEnvVar,
        authMode: ['ollama', 'vllm', 'lmstudio'].includes(preset.key) ? 'none' : 'api-key',
        apiKey: '',
        models: buildPresetModels(preset.key, preset.defaultDisplayName, prev.id),
      };
    });
    setFormTestResult(null);
  };

  const handleRestoreDefaultModels = () => {
    if (!draft) return;
    const key = draft.builtinKey || 'ollama';
    const nextModels = buildPresetModels(key, draft.displayName || 'Custom API', draft.id);
    setDraft((prev) => (prev ? { ...prev, models: nextModels } : prev));
    addToast('info', 'Đã mở ô nhập model mới. Chưa lưu thay đổi.');
  };

  const handleTriggerFetchModels = async () => {
    if (!draft) return;
    setFetchModalOpen(true);
    setFetchSearch('');
    setSelectedFetchedIds(new Set());
    setIsFetchingModels(true);
    setFetchNote('');

    try {
      const result = await fetchModelsFromProvider(draft);
      setFetchedModels(result.models);
      setFetchNote(result.note);
    } catch (error) {
      setFetchedModels([]);
      setFetchNote(error instanceof Error ? error.message : 'Không tải được danh sách model. Bạn có thể nhập model ID thủ công.');
    } finally { setIsFetchingModels(false); }
  };

  const existingModelIds = useMemo(() => {
    if (!draft) return new Set<string>();
    return new Set(
      draft.models.map((m) => (m.modelId || m.name).trim()).filter(Boolean)
    );
  }, [draft]);

  const filteredFetchedModels = useMemo(() => {
    const q = fetchSearch.trim().toLowerCase();
    if (!q) return fetchedModels;
    return fetchedModels.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.quantization.toLowerCase().includes(q)
    );
  }, [fetchedModels, fetchSearch]);

  const selectableFilteredModels = useMemo(
    () =>
      filteredFetchedModels.filter(
        (m) => !existingModelIds.has(m.modelId.trim())
      ),
    [filteredFetchedModels, existingModelIds]
  );

  const allFilteredSelected =
    selectableFilteredModels.length > 0 &&
    selectableFilteredModels.every((m) => selectedFetchedIds.has(m.modelId));

  const handleToggleSelectAllFetched = () => {
    setSelectedFetchedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const m of selectableFilteredModels) {
          next.delete(m.modelId);
        }
      } else {
        for (const m of selectableFilteredModels) {
          next.add(m.modelId);
        }
      }
      return next;
    });
  };

  const handleConfirmAddFetchedModels = () => {
    if (!draft || selectedFetchedIds.size === 0) return;
    const toAdd = fetchedModels.filter((m) => selectedFetchedIds.has(m.modelId));
    const providerLabel = draft.displayName.trim() || 'Nhà cung cấp tùy chỉnh';

    const newItems: ModelItem[] = toAdd.map((m, idx) => ({
      id: `${draft.id}-fetched-${Date.now()}-${idx}`,
      modelId: m.modelId,
      name: m.name,
      provider: providerLabel,
      providerId: draft.id,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      quantization: m.quantization,
      supportsText: m.supportsText,
      supportsImage: m.supportsImage,
      supportsReasoning: m.supportsReasoning,
      isRlTuned: m.isRlTuned,
    }));

    setDraft((prev) => {
      if (!prev) return prev;
      const nonBlankExisting = prev.models.filter(
        (item) => (item.modelId?.trim() || item.name.trim()).length > 0
      );
      return {
        ...prev,
        models: [...nonBlankExisting, ...newItems],
      };
    });

    setFetchModalOpen(false);
    setCustomSettingsOpen(true);
    addToast('success', `Đã thêm ${newItems.length} mô hình vào danh sách.`);
  };

  const handleTestFormConnection = async () => {
    if (!draft || testingFormConnection) return;
    setTestingFormConnection(true);
    setFormTestResult(null);
    try {
      const result = await fetchModelsFromProvider(draft);
      setFormTestResult({ ok: true, message: `Đã đọc danh sách ${result.models.length} model. Chưa gọi inference.` });
      setDraft((prev) => prev ? { ...prev, connectionStatus: 'connected' } : prev);
    } catch (error) {
      setFormTestResult({ ok: false, message: error instanceof Error ? error.message : 'Không kết nối được provider.' });
      setDraft((prev) => prev ? { ...prev, connectionStatus: 'error' } : prev);
    } finally { setTestingFormConnection(false); }
  };

  const handleTestLocalRuntime = async (provider: ModelProviderConfig) => {
    setTestingLocalId(provider.id);
    try {
      const result = await fetchModelsFromProvider(provider);
      setProviderConnectionStatus(provider.id, 'connected');
      addToast('info', `Đã đọc ${result.models.length} model từ ${provider.displayName}; chưa gọi inference.`);
    } catch (error) {
      setProviderConnectionStatus(provider.id, 'error');
      addToast('warning', error instanceof Error ? error.message : 'Không kết nối được provider.');
    } finally { setTestingLocalId(null); }
  };

  const handleSaveProvider = async () => {
    if (!draft || savingProvider) return;
    setSavingProvider(true);
    const saved = await upsertModelProvider({ ...draft, displayName: draft.displayName.trim() || 'Endpoint tùy chỉnh', baseUrl: draft.baseUrl.trim() });
    setSavingProvider(false);
    if (!saved) return;
    setViewMode('list');
    setDraft(null);
  };

  const updateDraftModel = (modelIdx: number, patch: Partial<ModelItem>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        models: prev.models.map((item, idx) => (idx === modelIdx ? { ...item, ...patch } : item)),
      };
    });
  };

  const removeDraftModel = (modelIdx: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        models: prev.models.filter((_, idx) => idx !== modelIdx),
      };
    });
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="llm-settings-title"
      >
        <div
          className="w-full max-w-[660px] rounded-[16px] bg-[var(--surface)] elevated-container flex flex-col max-h-[88vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {viewMode === 'list' ? (
            <>
              {/* Top Header (Screenshots 1 & 7): Segmented tabs [API | Máy chủ cục bộ] + Close */}
              <div className="flex items-center justify-between gap-3 px-6 py-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <h3 id="llm-settings-title" className="sr-only">
                    Thiết lập Mô hình Cục bộ và Nhà cung cấp API
                  </h3>
                  <div
                    role="tablist"
                    aria-label="Phân loại cấu hình mô hình"
                    className="inline-flex items-center p-1 rounded-[10px] bg-[var(--surface-recessed)] border border-[var(--border)]/60 gap-1"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={topTab === 'api'}
                      onClick={() => setTopTab('api')}
                      className={`h-8 px-3.5 rounded-[8px] text-[13px] leading-[18px] font-semibold transition-colors cursor-pointer ${
                        topTab === 'api'
                          ? 'bg-[var(--surface-control)] text-[var(--text)]'
                          : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      API
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={topTab === 'local'}
                      onClick={() => setTopTab('local')}
                      className={`h-8 px-3.5 rounded-[8px] text-[13px] leading-[18px] font-semibold transition-colors cursor-pointer ${
                        topTab === 'local'
                          ? 'bg-[var(--surface-control)] text-[var(--text)]'
                          : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      Máy chủ cục bộ
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Đóng"
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  <IconX size={20} stroke={1.75} />
                </button>
              </div>

              <div className="h-px w-full bg-[var(--divider)] shrink-0" />

              {/* Body */}
              <div className="p-6 scroll-area flex-1 min-h-[320px] flex flex-col gap-4">
                {topTab === 'api' ? (
                  <>
                    {/* Dashed full-width "+ Thêm nhà cung cấp" button (Screenshot 1) */}
                    <button
                      type="button"
                      onClick={openAddProviderForm}
                      className="w-full h-12 rounded-[12px] border border-dashed border-[var(--border)] bg-transparent hover:border-[var(--border-hover)] hover:bg-[var(--surface-card-hover)] text-[14px] leading-[20px] font-semibold text-[var(--text)] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                    >
                      <IconPlus size={17} stroke={2} />
                      <span>Thêm nhà cung cấp</span>
                    </button>

                    {/* Configured API Providers list */}
                    {apiProviders.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-[13px] text-[var(--text-muted)]">
                        Chưa có nhà cung cấp API nào được cấu hình. Nhấn &ldquo;Thêm nhà cung
                        cấp&rdquo; để kết nối máy chủ mô hình.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {apiProviders.map((prov) => (
                          <div
                            key={prov.id}
                            className="rounded-[12px] bg-[var(--surface-card)] border border-[var(--border)]/60 p-4 flex items-center justify-between gap-4"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-11 h-11 rounded-[10px] bg-[var(--surface-recessed)] border border-[var(--border)]/60 flex items-center justify-center text-[var(--text)] shrink-0">
                                <IconPlugConnected size={21} stroke={1.75} />
                              </div>
                              <div className="min-w-0 flex flex-col gap-0.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[15px] leading-[20px] font-bold text-[var(--text)] truncate">
                                    {prov.displayName}
                                  </span>
                                  <span className="text-[12px] leading-[16px] text-[var(--text-muted)] tabular-nums shrink-0">
                                    · {prov.models.length} mô hình
                                  </span>
                                </div>
                                <span className="text-[12px] leading-[18px] font-mono text-[var(--text-muted)] truncate">
                                  {prov.baseUrl}
                                </span>
                                <span className="text-[12px] leading-[16px] text-[var(--text-muted)]">
                                  {protocolLabel(prov.protocol)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => openEditProviderForm(prov)}
                                className="h-9 px-3.5 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <IconAdjustmentsHorizontal size={15} stroke={1.75} />
                                <span>Cấu hình</span>
                              </button>
                              <button
                                type="button"
                                aria-label={`Xóa nhà cung cấp ${prov.displayName}`}
                                title="Xóa nhà cung cấp"
                                disabled={savingProvider}
                                onClick={() => deleteModelProvider(prov.id)}
                                className="w-9 h-9 rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--destroy-bg)] hover:text-[var(--destroy-fg-hover)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <IconTrash size={16} stroke={1.75} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  /* Tab 2: Máy chủ cục bộ (Screenshot 7 layout) */
                  <>
                    <p className="text-[14px] leading-[20px] text-[var(--text-body)]">
                      Cấu hình máy chủ cục bộ trong danh sách provider. Không tự tải hay khởi chạy model.
                    </p>

                    {localRuntimeProvider && (
                      <div className="rounded-[12px] bg-[var(--surface-card)] border border-[var(--border)]/60 p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 rounded-[10px] bg-[var(--surface-recessed)] border border-[var(--border)]/60 flex items-center justify-center text-[var(--text)] shrink-0">
                            <IconCpu size={24} stroke={1.65} />
                          </div>
                          <div className="min-w-0 flex flex-col gap-0.5">
                            <span className="text-[12px] leading-[16px] text-[var(--text-muted)]">
                              Máy chủ suy luận cục bộ
                            </span>
                            <span className="text-[16px] leading-[22px] font-bold text-[var(--text)] truncate">
                              {localRuntimeProvider.displayName}
                            </span>
                            <div className="flex items-center gap-1.5 text-[13px] leading-[18px] text-[var(--text-muted)]">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  localRuntimeProvider.connectionStatus === 'connected'
                                    ? 'bg-[var(--success-fg)]'
                                    : localRuntimeProvider.connectionStatus === 'error'
                                      ? 'bg-[var(--destroy-fg)]'
                                      : 'bg-[var(--text-muted)]/60'
                                }`}
                              />
                              <span className="tabular-nums">
                                {localRuntimeProvider.connectionStatus === 'connected'
                                  ? `Đã tải danh sách · ${localRuntimeProvider.models.length} mô hình`
                                  : 'Đã lưu · chưa kiểm tra kết nối'}
                              </span>
                            </div>
                            <span className="text-[12px] leading-[16px] font-mono text-[var(--text-muted)] truncate">
                              {localRuntimeProvider.baseUrl}
                            </span>
                          </div>
                        </div>

                        {/* Stacked right actions matching Screenshot 7 */}
                        <div className="flex flex-col gap-2 shrink-0 min-w-[146px]">
                          <button
                            type="button"
                            onClick={() => openEditProviderForm(localRuntimeProvider)}
                            className="h-9 px-3.5 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <IconAdjustmentsHorizontal size={15} stroke={1.75} />
                            <span>Cấu hình</span>
                          </button>
                          <button
                            type="button"
                            disabled={testingLocalId === localRuntimeProvider.id}
                            onClick={() => handleTestLocalRuntime(localRuntimeProvider)}
                            className="h-9 px-3.5 rounded-[8px] bg-[#FCA311] text-[#14213D] hover:bg-[var(--accent-hover)] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                          >
                            {testingLocalId === localRuntimeProvider.id && (
                              <IconLoader2 size={14} className="animate-spin" />
                            )}
                            <span>Kiểm tra kết nối</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Preserved Local Adapter RL & VRAM Fallback controls */}
                    <div className="rounded-[12px] bg-[var(--surface-recessed)]/70 border border-[var(--border)]/50 p-4 flex flex-col gap-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex flex-col gap-0.5">
                          <span className="text-[13px] leading-[18px] font-semibold text-[var(--text)]">
                            Adapter RL đang hoạt động
                          </span>
                          <span className="text-[12px] leading-[18px] text-[var(--text-muted)] font-mono truncate">
                            {localLlmConfig.activeAdapterVersion}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={!localLlmConfig.previousAdapterVersion}
                          onClick={rollbackRlAdapter}
                          className="h-8 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[12px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <IconHistory size={14} stroke={1.75} />
                          <span>Rollback</span>
                        </button>
                      </div>

                      <div className="h-px w-full bg-[var(--divider)]" />

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="local-fallback-input"
                          className="text-[13px] leading-[18px] font-semibold text-[var(--text)]"
                        >
                          Mô hình dự phòng khi thiếu VRAM
                        </label>
                        <div className="flex items-center gap-2">
                          <select id="local-fallback-input" value={fallbackDraft} onChange={(e) => setFallbackDraft(e.target.value)}
                            className="flex-1 min-w-0 h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] text-[var(--text)]">
                            <option value="">Không tự chuyển model</option>
                            {fallbackModels.filter((m) => m.supportsText !== false).map((m) => <option key={m.id} value={m.id}>{m.provider} · {m.name}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              updateLocalLlmConfig({
                                quantizationFallback:
                                  fallbackDraft,
                              })
                            }
                            className="h-9 px-3.5 rounded-[8px] bg-[var(--surface-control)] text-[13px] font-semibold text-[var(--text)] hover:bg-[var(--surface-card-hover)] transition-colors shrink-0 cursor-pointer"
                          >
                            Áp dụng
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="h-px w-full bg-[var(--divider)] shrink-0" />

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </>
          ) : (
            /* Add / Edit Provider Sub-View (Screenshots 2, 3, 5, 6) */
            draft && (
              <>
                <div className="flex items-center justify-between gap-3 px-6 py-4 shrink-0">
                  <div
                    role="tablist"
                    aria-label="Kiểu cấu hình nhà cung cấp"
                    className="inline-flex items-center p-1 rounded-[10px] bg-[var(--surface-recessed)] border border-[var(--border)]/60 gap-1"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={draft.sourceType === 'builtin'}
                      onClick={() => handleSwitchSourceType('builtin')}
                      className={`h-8 px-3.5 rounded-[8px] text-[13px] leading-[18px] font-semibold transition-colors cursor-pointer ${
                        draft.sourceType === 'builtin'
                          ? 'bg-[var(--surface-control)] text-[var(--text)]'
                          : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      Nhà cung cấp tích hợp
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={draft.sourceType === 'custom'}
                      onClick={() => handleSwitchSourceType('custom')}
                      className={`h-8 px-3.5 rounded-[8px] text-[13px] leading-[18px] font-semibold transition-colors cursor-pointer ${
                        draft.sourceType === 'custom'
                          ? 'bg-[var(--surface-control)] text-[var(--text)]'
                          : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      API mô hình tùy chỉnh
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-label="Quay lại danh sách nhà cung cấp"
                    onClick={() => {
                      setViewMode('list');
                      setDraft(null);
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
                  >
                    <IconX size={20} stroke={1.75} />
                  </button>
                </div>

                <div className="h-px w-full bg-[var(--divider)] shrink-0" />

                <div className="p-6 scroll-area flex-1 flex flex-col gap-4">
                  <p className="text-[13px] leading-[20px] text-[var(--text-body)]">
                    {draft.sourceType === 'builtin'
                      ? 'Chọn nhà cung cấp từ danh mục tích hợp và kiểm tra kết nối máy chủ mô hình.'
                      : 'Nhập địa chỉ URL cơ sở của máy chủ suy luận tùy chỉnh và tải danh sách mô hình.'}
                  </p>

                  {draft.sourceType === 'builtin' ? (
                    <>
                      {/* Nhà cung cấp dropdown (Screenshot 2) */}
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="builtin-provider-select"
                          className="text-[13px] leading-[18px] font-semibold text-[var(--text)]"
                        >
                          Nhà cung cấp
                        </label>
                        <select
                          id="builtin-provider-select"
                          value={draft.builtinKey ?? 'ollama'}
                          onChange={(e) => handleSelectBuiltinPreset(e.target.value)}
                          className="w-full h-10 px-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[14px] text-[var(--text)] hover:border-[var(--border-hover)] cursor-pointer"
                        >
                          {BUILTIN_PROVIDER_PRESETS.map((preset) => (
                            <option key={preset.key} value={preset.key}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </div>

                    </>
                  ) : (
                    <>
                      {/* Custom API tab top fields (Screenshot 5) */}
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="custom-base-url-input"
                          className="text-[13px] leading-[18px] font-semibold text-[var(--text)]"
                        >
                          URL cơ sở
                        </label>
                        <input
                          id="custom-base-url-input"
                          type="text"
                          value={draft.baseUrl}
                          onChange={(e) =>
                            setDraft((prev) =>
                              prev ? { ...prev, baseUrl: e.target.value } : prev
                            )
                          }
                          placeholder="http://127.0.0.1:2455/v1"
                          className="w-full h-10 px-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[13px] font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                        />
                      </div>

                    </>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="provider-auth-mode" className="text-[13px] font-semibold text-[var(--text)]">Xác thực provider</label>
                    <select id="provider-auth-mode" value={draft.authMode ?? (draft.hasApiKey ? 'api-key' : draft.authEnvVar ? 'environment' : 'none')}
                      onChange={(e) => {
                        const authMode = e.target.value;
                        if (authMode !== 'api-key' && authMode !== 'environment' && authMode !== 'none') return;
                        setDraft((prev) => prev ? { ...prev, authMode, apiKey: '' } : prev);
                      }}
                      className="w-full h-10 px-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[14px] text-[var(--text)]">
                      <option value="api-key">API key riêng cho provider</option>
                      <option value="environment">Biến môi trường trên backend</option>
                      <option value="none">Không xác thực</option>
                    </select>
                  </div>
                  {(draft.authMode ?? (draft.hasApiKey ? 'api-key' : draft.authEnvVar ? 'environment' : 'none')) === 'api-key' && (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="provider-api-key" className="text-[13px] font-semibold text-[var(--text)]">API key</label>
                      <input id="provider-api-key" type="password" autoComplete="new-password" spellCheck={false}
                        value={draft.apiKey ?? ''} aria-describedby="provider-api-key-hint"
                        placeholder={draft.hasApiKey ? 'Đã lưu key — nhập để thay thế' : 'Dán API key của provider này'}
                        onChange={(e) => setDraft((prev) => prev ? { ...prev, apiKey: e.target.value } : prev)}
                        className="w-full h-10 px-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[13px] font-mono text-[var(--text)]" />
                      <p id="provider-api-key-hint" className="text-[12px] leading-[18px] text-[var(--text-muted)]">
                        Key được mã hóa ở backend, lưu riêng cho provider này. {draft.hasApiKey ? 'Để trống để giữ key đã lưu. Chọn Không xác thực rồi Lưu để xóa key.' : 'Không cần thêm biến môi trường. Bấm Lưu để giữ key sau khi đóng form.'}
                      </p>
                    </div>
                  )}
                  {(draft.authMode ?? (draft.hasApiKey ? 'api-key' : draft.authEnvVar ? 'environment' : 'none')) === 'environment' && (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="provider-env-var-input" className="text-[13px] font-semibold text-[var(--text)]">Tên biến môi trường chứa API key</label>
                      <input id="provider-env-var-input" type="text" value={draft.authEnvVar ?? ''} placeholder="Ví dụ: PROVIDER_A_API_KEY"
                        aria-describedby="provider-env-var-hint"
                        onChange={(e) => setDraft((prev) => prev ? { ...prev, authEnvVar: e.target.value } : prev)}
                        className="w-full h-10 px-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[13px] font-mono text-[var(--text)]" />
                      <p id="provider-env-var-hint" className="text-[12px] leading-[18px] text-[var(--text-muted)]">
                        Nhập tên biến trong .env ở thư mục gốc dự án, không nhập key trực tiếp. Khởi động lại backend sau khi sửa .env.
                      </p>
                    </div>
                  )}

                  <div className="h-px w-full bg-[var(--divider)]" />

                  {/* Collapsible "Cài đặt tùy chỉnh" (Screenshots 2, 3, 5, 6) */}
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      aria-expanded={customSettingsOpen}
                      onClick={() => setCustomSettingsOpen((v) => !v)}
                      className="inline-flex items-center gap-2 text-[14px] leading-[20px] font-semibold text-[var(--text)] hover:text-[var(--accent-ink)] transition-colors w-fit cursor-pointer"
                    >
                      {customSettingsOpen ? (
                        <IconChevronDown size={16} stroke={2} />
                      ) : (
                        <IconChevronRight size={16} stroke={2} />
                      )}
                      <span>Cài đặt tùy chỉnh</span>
                    </button>

                    {customSettingsOpen && (
                      <div className="rounded-[12px] border border-[var(--border)]/70 bg-[var(--surface-recessed)]/40 p-4 flex flex-col gap-4">
                        {/* Tên hiển thị */}
                        <div className="flex flex-col gap-1.5">
                          <label
                            htmlFor="provider-display-name"
                            className="text-[13px] leading-[18px] font-semibold text-[var(--text)]"
                          >
                            Tên hiển thị
                          </label>
                          <input
                            id="provider-display-name"
                            type="text"
                            value={draft.displayName}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev ? { ...prev, displayName: e.target.value } : prev
                              )
                            }
                            placeholder="codex-lb"
                            className="w-full h-10 px-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[14px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                          />
                        </div>

                        {/* URL cơ sở */}
                        <div className="flex flex-col gap-1.5">
                          <label
                            htmlFor="provider-base-url"
                            className="text-[13px] leading-[18px] font-semibold text-[var(--text)]"
                          >
                            URL cơ sở
                          </label>
                          <input
                            id="provider-base-url"
                            type="text"
                            value={draft.baseUrl}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev ? { ...prev, baseUrl: e.target.value } : prev
                              )
                            }
                            placeholder="http://127.0.0.1:2455/v1"
                            className="w-full h-10 px-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[13px] font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                          />
                        </div>

                        {/* Giao thức API (Screenshot 6) */}
                        <div className="flex flex-col gap-1.5">
                          <label
                            htmlFor="provider-api-protocol"
                            className="text-[13px] leading-[18px] font-semibold text-[var(--text)]"
                          >
                            Giao thức API
                          </label>
                          <select
                            id="provider-api-protocol"
                            value={draft.protocol}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev
                                  ? { ...prev, protocol: e.target.value as ApiProtocol }
                                  : prev
                              )
                            }
                            className="w-full h-10 px-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[14px] text-[var(--text)] hover:border-[var(--border-hover)] cursor-pointer"
                          >
                            {PROTOCOL_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Mô hình header + Nhập lại model · Tải danh sách mô hình (Screenshot 3) */}
                        <div className="flex flex-col gap-3 pt-1">
                          <div className="flex items-end justify-between gap-3 flex-wrap">
                            <div className="flex flex-col">
                              <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)]">
                                Mô hình
                              </span>
                              <span className="text-[12px] leading-[16px] text-[var(--text-muted)]">
                                Danh mục mô hình tùy chỉnh
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[13px] leading-[18px]">
                              <button
                                type="button"
                                onClick={handleRestoreDefaultModels}
                                className="text-[var(--text-body)] hover:text-[var(--text)] transition-colors cursor-pointer"
                              >
                                Nhập lại model
                              </button>
                              <span className="text-[var(--text-muted)]">•</span>
                              <button
                                type="button"
                                onClick={handleTriggerFetchModels}
                                className="font-semibold text-[var(--accent-ink)] hover:underline transition-colors cursor-pointer"
                              >
                                Tải danh sách mô hình
                              </button>
                            </div>
                          </div>

                          {/* Editable Model Cards (Screenshot 3) */}
                          <div className="flex flex-col gap-2.5">
                            {draft.models.map((m, idx) => (
                              <div
                                key={m.id}
                                className="rounded-[10px] border border-[var(--border)]/70 bg-[var(--surface-card)] p-3.5 flex flex-col gap-3"
                              >
                                <div className="grid grid-cols-[1fr_1fr_auto] gap-2.5 items-end">
                                  <div className="flex flex-col gap-1 min-w-0">
                                    <label className="text-[12px] leading-[16px] font-semibold text-[var(--text)]">
                                      Mã mô hình (Model ID)
                                    </label>
                                    <input
                                      type="text"
                                      value={m.modelId ?? m.name}
                                      onChange={(e) =>
                                        updateDraftModel(idx, { modelId: e.target.value })
                                      }
                                      placeholder="Nhập ID model do dịch vụ cung cấp"
                                      className="w-full h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1 min-w-0">
                                    <label className="text-[12px] leading-[16px] font-semibold text-[var(--text)]">
                                      Tên hiển thị
                                    </label>
                                    <input
                                      type="text"
                                      value={m.name}
                                      onChange={(e) =>
                                        updateDraftModel(idx, { name: e.target.value })
                                      }
                                      placeholder="Display name"
                                      className="w-full h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    aria-label={`Xóa mô hình ${m.name || idx + 1}`}
                                    title="Xóa mô hình"
                                    onClick={() => removeDraftModel(idx)}
                                    className="w-9 h-9 rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--destroy-bg)] hover:text-[var(--destroy-fg-hover)] flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    <IconTrash size={16} stroke={1.75} />
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[12px] leading-[16px] font-semibold text-[var(--text)]">
                                      Cửa sổ ngữ cảnh
                                    </label>
                                    <input
                                      type="text"
                                      value={m.contextWindow}
                                      onChange={(e) =>
                                        updateDraftModel(idx, { contextWindow: e.target.value })
                                      }
                                      placeholder="128K"
                                      className="w-full h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] tabular-nums text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <label className="text-[12px] leading-[16px] font-semibold text-[var(--text)]">
                                      Số token đầu ra tối đa
                                    </label>
                                    <input
                                      type="text"
                                      value={m.maxOutputTokens ?? '16K'}
                                      onChange={(e) =>
                                        updateDraftModel(idx, {
                                          maxOutputTokens: e.target.value,
                                        })
                                      }
                                      placeholder="16K"
                                      className="w-full h-9 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] tabular-nums text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-3 pt-0.5 flex-wrap">
                                  <div className="flex items-center gap-3.5 text-[13px] text-[var(--text-body)]">
                                    <span className="text-[var(--text-muted)]">Loại đầu vào:</span>
                                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={m.supportsText ?? true}
                                        onChange={(e) =>
                                          updateDraftModel(idx, {
                                            supportsText: e.target.checked,
                                          })
                                        }
                                        className="w-4 h-4 accent-[#FCA311] cursor-pointer"
                                      />
                                      <span>Văn bản</span>
                                    </label>
                                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(m.supportsImage)}
                                        onChange={(e) =>
                                          updateDraftModel(idx, {
                                            supportsImage: e.target.checked,
                                          })
                                        }
                                        className="w-4 h-4 accent-[#FCA311] cursor-pointer"
                                      />
                                      <span>Hình ảnh</span>
                                    </label>
                                  </div>

                                  <div className="flex items-center gap-2 text-[13px] text-[var(--text-body)]">
                                    <span>Lập luận</span>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={Boolean(m.supportsReasoning)}
                                      aria-label={`Bật chế độ lập luận cho ${m.name || 'mô hình'}`}
                                      onClick={() =>
                                        updateDraftModel(idx, {
                                          supportsReasoning: !m.supportsReasoning,
                                        })
                                      }
                                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                                        m.supportsReasoning
                                          ? 'bg-[#FCA311]'
                                          : 'bg-[var(--surface-track)] border border-[var(--border)]'
                                      }`}
                                    >
                                      <span
                                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${
                                          m.supportsReasoning
                                            ? 'translate-x-5 bg-[#14213D]'
                                            : 'translate-x-0 bg-[var(--text-muted)]'
                                        }`}
                                      />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Full-width "+ Thêm mô hình" button (Screenshot 3) */}
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      models: [
                                        ...prev.models,
                                        createBlankModel(
                                          prev.displayName || 'Nhà cung cấp tùy chỉnh',
                                          prev.id
                                        ),
                                      ],
                                    }
                                  : prev
                              )
                            }
                            className="w-full h-10 rounded-[10px] border border-[var(--border)] bg-transparent hover:border-[var(--border-hover)] hover:bg-[var(--surface-card-hover)] text-[13px] font-semibold text-[var(--text)] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <IconPlus size={15} stroke={2} />
                            <span>Thêm mô hình</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {formTestResult && (
                    <div
                      className={`rounded-[10px] px-3.5 py-2.5 text-[13px] leading-[18px] font-medium ${
                        formTestResult.ok
                          ? 'bg-[var(--success-bg)] text-[var(--success-fg)]'
                          : 'bg-[var(--destroy-bg)] text-[var(--destroy-fg)]'
                      }`}
                    >
                      {formTestResult.message}
                    </div>
                  )}
                </div>

                <div className="h-px w-full bg-[var(--divider)] shrink-0" />

                {/* Form Footer (Screenshots 2 & 5): Left Test Connection, Right Hủy + Lưu */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 shrink-0">
                  <button
                    type="button"
                    disabled={testingFormConnection}
                    onClick={handleTestFormConnection}
                    className="h-9 px-4 rounded-[8px] bg-transparent border border-[var(--border)] text-[13px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {testingFormConnection && <IconLoader2 size={14} className="animate-spin" />}
                    <span>Kiểm tra kết nối</span>
                  </button>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('list');
                        setDraft(null);
                      }}
                      className="h-9 px-4 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      disabled={savingProvider}
                      onClick={() => void handleSaveProvider()}
                      className="h-9 px-5 rounded-[8px] bg-[#FCA311] text-[#14213D] hover:bg-[var(--accent-hover)] text-[14px] font-semibold transition-colors cursor-pointer"
                    >
                      Lưu
                    </button>
                  </div>
                </div>
              </>
            )
          )}
        </div>
      </div>

      {/* Fetch Models Picker Modal ("Chọn mô hình để thêm" — Screenshot 4) */}
      {fetchModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--overlay-backdrop)] p-4"
          onClick={() => setFetchModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="fetch-models-title"
        >
          <div
            className="w-full max-w-[500px] rounded-[16px] bg-[var(--surface)] elevated-container flex flex-col max-h-[82vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
              <h4
                id="fetch-models-title"
                className="text-[18px] leading-[24px] font-bold text-[var(--text)]"
              >
                Chọn mô hình để thêm
              </h4>
              <button
                type="button"
                aria-label="Đóng danh sách mô hình"
                onClick={() => setFetchModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <IconX size={18} stroke={1.75} />
              </button>
            </div>

            <div className="px-6 pb-4 flex flex-col gap-3 shrink-0">
              <p className="text-[13px] leading-[20px] text-[var(--text-body)]">
                Đây là các mô hình hiện có từ nhà cung cấp này. Hãy chọn các mô hình bạn muốn thêm.
              </p>

              {/* Search input + Chọn tất cả (Screenshot 4) */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <IconSearch
                    size={16}
                    stroke={1.75}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
                  />
                  <input
                    type="text"
                    value={fetchSearch}
                    onChange={(e) => setFetchSearch(e.target.value)}
                    placeholder="Tìm kiếm mô hình"
                    aria-label="Tìm kiếm mô hình"
                    className="w-full h-10 pl-9 pr-3 rounded-[10px] bg-transparent border border-[var(--border)] text-[14px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                  />
                </div>
                <button
                  type="button"
                  disabled={selectableFilteredModels.length === 0 || isFetchingModels}
                  onClick={handleToggleSelectAllFetched}
                  className="text-[13px] font-semibold text-[var(--text-body)] hover:text-[var(--text)] disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                >
                  {allFilteredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              </div>

              {fetchNote && !isFetchingModels && (
                <div className="flex items-center justify-between gap-2 text-[12px] leading-[16px] text-[var(--text-muted)]">
                  <span className="truncate" title={fetchNote}>
                    {fetchNote}
                  </span>
                  <button
                    type="button"
                    title="Tải lại danh sách mô hình"
                    onClick={handleTriggerFetchModels}
                    className="inline-flex items-center gap-1 text-[var(--accent-ink)] hover:underline shrink-0 cursor-pointer"
                  >
                    <IconRefresh size={13} stroke={2} />
                    <span>Tải lại</span>
                  </button>
                </div>
              )}
            </div>

            <div className="h-px w-full bg-[var(--divider)] shrink-0" />

            {/* Fetched model list */}
            <div className="px-6 py-3 scroll-area flex-1 min-h-[180px] max-h-[290px] flex flex-col gap-1.5">
              {isFetchingModels ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2.5 py-10 text-[13px] text-[var(--text-muted)]">
                  <IconLoader2 size={22} className="animate-spin text-[var(--accent-ink)]" />
                  <span>Đang tải danh sách mô hình...</span>
                </div>
              ) : filteredFetchedModels.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-10 text-[14px] text-[var(--text-muted)]">
                  Không tìm thấy mô hình phù hợp.
                </div>
              ) : (
                filteredFetchedModels.map((item) => {
                  const alreadyAdded = existingModelIds.has(item.modelId.trim());
                  const isChecked = selectedFetchedIds.has(item.modelId);
                  return (
                    <label
                      key={item.modelId}
                      className={`rounded-[10px] px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                        alreadyAdded
                          ? 'bg-[var(--surface-recessed)]/50 opacity-60 cursor-not-allowed'
                          : isChecked
                            ? 'bg-[var(--surface-control)] cursor-pointer'
                            : 'bg-transparent hover:bg-[var(--surface-card-hover)] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          disabled={alreadyAdded}
                          checked={alreadyAdded || isChecked}
                          onChange={() => {
                            if (alreadyAdded) return;
                            setSelectedFetchedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.modelId)) next.delete(item.modelId);
                              else next.add(item.modelId);
                              return next;
                            });
                          }}
                          className="w-4 h-4 accent-[#FCA311] shrink-0 cursor-pointer"
                        />
                        <div className="min-w-0 flex flex-col">
                          <span className="text-[13px] leading-[18px] font-semibold font-mono text-[var(--text)] truncate">
                            {item.modelId}
                          </span>
                          <span className="text-[12px] leading-[16px] text-[var(--text-muted)] tabular-nums truncate">
                            {item.contextWindow} · {item.quantization}
                            {item.supportsReasoning ? ' · Lập luận' : ''}
                            {item.supportsImage ? ' · Hình ảnh' : ''}
                          </span>
                        </div>
                      </div>

                      {alreadyAdded && (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-muted)] shrink-0">
                          <IconCheck size={14} stroke={2} />
                          <span>Đã có</span>
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            <div className="h-px w-full bg-[var(--divider)] shrink-0" />

            {/* Picker Modal Footer (Screenshot 4) */}
            <div className="flex items-center justify-end gap-2.5 px-6 py-4 shrink-0">
              <button
                type="button"
                onClick={() => setFetchModalOpen(false)}
                className="h-9 px-4 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={selectedFetchedIds.size === 0}
                onClick={handleConfirmAddFetchedModels}
                className={`h-9 px-4 rounded-[8px] text-[14px] font-semibold transition-colors ${
                  selectedFetchedIds.size > 0
                    ? 'bg-[#FCA311] text-[#14213D] hover:bg-[var(--accent-hover)] cursor-pointer'
                    : 'bg-[var(--surface-recessed)] text-[var(--text-muted)]/60 cursor-not-allowed'
                }`}
              >
                {selectedFetchedIds.size > 0
                  ? `Thêm mục đã chọn (${selectedFetchedIds.size})`
                  : 'Thêm mục đã chọn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
