export type AIProviderType = 'openai' | 'anthropic'

export interface AIProviderConfig {
  id: string
  type: AIProviderType
  name: string
  apiKey: string
  baseUrl: string
  model: string
}

export interface AISettings {
  providers: AIProviderConfig[]
  activeProviderId: string | null
}

export interface AIModelInfo {
  id: string
  name?: string
}

export const DEFAULT_BASE_URLS: Record<AIProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
}

export const PRESET_MODELS: Record<AIProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o3-mini'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
}
