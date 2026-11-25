import { z } from 'zod';
import { apiRequest, jsonRequest } from './workspace-api';
import type { LocalLlmConfig, ModelProviderConfig } from '../types/workspace';

const modelSchema = z.object({
  id: z.string(), model_id: z.string(), name: z.string(), context_window: z.string(), max_output_tokens: z.string(),
  quantization: z.string(), supports_text: z.boolean(), supports_image: z.boolean(), supports_reasoning: z.boolean(), is_rl_tuned: z.boolean(),
});
const providerSchema = z.object({
  id: z.string(), source_type: z.enum(['builtin', 'custom']), builtin_key: z.string().nullable(), display_name: z.string(), base_url: z.string(),
  protocol: z.enum(['openai-chat', 'openai-responses', 'anthropic-messages', 'ollama-native']), auth_env_var: z.string(), has_api_key: z.boolean().default(false), is_local_runtime: z.boolean(), models: z.array(modelSchema),
});
const settingsSchema = z.object({ providers: z.array(providerSchema), selected_model_id: z.string().nullable(), fallback_model_id: z.string().nullable() });

function parseSettings(value: unknown) {
  const data = settingsSchema.parse(value);
  const modelProviders: ModelProviderConfig[] = data.providers.map((p) => ({
    id: p.id, sourceType: p.source_type, builtinKey: p.builtin_key || undefined, displayName: p.display_name,
    baseUrl: p.base_url, protocol: p.protocol, authEnvVar: p.auth_env_var, hasApiKey: p.has_api_key,
    authMode: p.has_api_key ? 'api-key' : p.auth_env_var ? 'environment' : 'none', isLocalRuntime: p.is_local_runtime,
    connectionStatus: 'unconfigured', models: p.models.map((m) => ({
      id: m.id, modelId: m.model_id, name: m.name, provider: p.display_name, providerId: p.id,
      contextWindow: m.context_window, maxOutputTokens: m.max_output_tokens, quantization: m.quantization,
      supportsText: m.supports_text, supportsImage: m.supports_image, supportsReasoning: m.supports_reasoning, isRlTuned: m.is_rl_tuned,
    })),
  }));
  const localLlmConfig: LocalLlmConfig = {
    endpointUrl: modelProviders.find((p) => p.isLocalRuntime)?.baseUrl || '', activeAdapterVersion: 'Chưa có adapter', previousAdapterVersion: '',
    quantizationFallback: data.fallback_model_id || '',
  };
  return { modelProviders, selectedModelId: data.selected_model_id || '', localLlmConfig };
}

function payload(p: ModelProviderConfig) {
  const authMode = p.authMode || (p.hasApiKey || p.apiKey ? 'api-key' : p.authEnvVar ? 'environment' : 'none');
  const authEnvVar = authMode === 'environment' ? p.authEnvVar?.trim() || '' : '';
  if (authMode === 'api-key' && !p.apiKey?.trim() && !p.hasApiKey) {
    throw new Error('Hãy nhập API key riêng của provider này, hoặc chọn Không xác thực nếu endpoint không cần key.');
  }
  if (authMode === 'environment' && !authEnvVar) {
    throw new Error('Hãy nhập tên biến môi trường chứa key, hoặc chọn Không xác thực.');
  }
  if (authEnvVar.length > 128 || (authEnvVar && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(authEnvVar))) {
    throw new Error('Chỉ nhập tên biến môi trường như CUSTOM_LLM_API_KEY (tối đa 128 ký tự), không nhập API key, dấu $ hoặc dòng NAME=value. Để trống nếu endpoint không cần xác thực.');
  }
  return { id: p.id, source_type: p.sourceType, builtin_key: p.builtinKey || null, display_name: p.displayName.trim() || 'Nhà cung cấp tùy chỉnh',
    base_url: p.baseUrl.trim(), protocol: p.protocol, auth_env_var: authEnvVar,
    api_key: authMode === 'api-key' ? p.apiKey?.trim() || null : null, clear_api_key: authMode !== 'api-key', is_local_runtime: p.isLocalRuntime || false,
    models: p.models.filter((m) => (m.modelId || m.name).trim()).map((m) => ({
      id: m.id, model_id: (m.modelId || m.name).trim(), name: m.name.trim() || m.modelId?.trim() || '',
      context_window: m.contextWindow.trim(), max_output_tokens: m.maxOutputTokens?.trim() || '', quantization: m.quantization.trim(),
      supports_text: m.supportsText !== false, supports_image: m.supportsImage || false, supports_reasoning: m.supportsReasoning || false, is_rl_tuned: m.isRlTuned || false,
    })),
  };
}
export const loadProviderSettings = async () => parseSettings(await apiRequest('/api/llm/settings'));
export const saveProvider = async (p: ModelProviderConfig) => parseSettings(await apiRequest(`/api/llm/providers/${encodeURIComponent(p.id)}`, jsonRequest('PUT', payload(p))));
export const removeProvider = async (id: string) => {
  await apiRequest(`/api/llm/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return loadProviderSettings();
};
export const selectModel = async (id: string) => parseSettings(await apiRequest('/api/llm/selection', jsonRequest('PUT', { model_id: id })));
export const selectFallback = async (id: string) => parseSettings(await apiRequest('/api/llm/fallback', jsonRequest('PUT', { model_id: id || null })));
export async function discoverModels(provider: ModelProviderConfig) {
  return z.object({ models: z.array(z.object({ model_id: z.string(), name: z.string() })) })
    .parse(await apiRequest('/api/llm/providers/discover', jsonRequest('POST', { ...payload(provider), models: [] }))).models;
}
