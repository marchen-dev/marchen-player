import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { aiSettingAtom } from '@renderer/atoms/settings/ai'
import { jotaiStore } from '@renderer/atoms/store'

export function getActiveAIModel(): LanguageModel | null {
  const settings = jotaiStore.get(aiSettingAtom)
  const active = settings.providers.find((p) => p.id === settings.activeProviderId)
  if (!active) return null

  if (active.type === 'openai') {
    const provider = createOpenAI({ apiKey: active.apiKey, baseURL: active.baseUrl })
    return provider(active.model)
  }

  if (active.type === 'anthropic') {
    const provider = createAnthropic({ apiKey: active.apiKey, baseURL: active.baseUrl })
    return provider(active.model)
  }

  return null
}
