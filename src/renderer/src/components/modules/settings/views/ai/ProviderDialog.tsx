import type { AIProviderConfig, AIProviderType } from '@renderer/request/models/ai'
import type { FC } from 'react'
import { useAISettings } from '@renderer/atoms/settings/ai'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { apiClient } from '@renderer/request'
import { DEFAULT_BASE_URLS, PRESET_MODELS } from '@renderer/request/models/ai'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useState } from 'react'

import { ModelCombobox } from './ModelCombobox'

interface ProviderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingProvider?: AIProviderConfig
}

export const ProviderDialog: FC<ProviderDialogProps> = ({
  open,
  onOpenChange,
  editingProvider,
}) => {
  const [, setSettings] = useAISettings()
  const [type, setType] = useState<AIProviderType>('openai')
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URLS.openai)
  const [model, setModel] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    if (open) {
      if (editingProvider) {
        setType(editingProvider.type)
        setName(editingProvider.name)
        setApiKey(editingProvider.apiKey)
        setBaseUrl(editingProvider.baseUrl)
        setModel(editingProvider.model)
      } else {
        setType('openai')
        setName('')
        setApiKey('')
        setBaseUrl(DEFAULT_BASE_URLS.openai)
        setModel('')
      }
      setTestResult(null)
    }
  }, [open, editingProvider])

  const handleTypeChange = (newType: AIProviderType) => {
    setType(newType)
    setBaseUrl(DEFAULT_BASE_URLS[newType])
    setModel('')
    setTestResult(null)
  }

  const handleTestConnection = useCallback(async () => {
    if (!apiKey || !baseUrl) return
    setTesting(true)
    setTestResult(null)
    const result = await apiClient.ai.testConnection(type, apiKey, baseUrl)
    setTestResult(result)
    setTesting(false)
  }, [type, apiKey, baseUrl])

  const handleSave = () => {
    const providerName = name || `${type === 'openai' ? 'OpenAI' : 'Anthropic'}`
    const config: AIProviderConfig = {
      id: editingProvider?.id || nanoid(),
      type,
      name: providerName,
      apiKey,
      baseUrl,
      model: model || PRESET_MODELS[type][0],
    }

    setSettings((prev) => {
      if (editingProvider) {
        const providers = prev.providers.map((p) => (p.id === config.id ? config : p))
        return { ...prev, providers }
      }
      const providers = [...prev.providers, config]
      // 首个 provider 自动激活
      const activeProviderId = prev.providers.length === 0 ? config.id : prev.activeProviderId
      return { ...prev, providers, activeProviderId }
    })

    onOpenChange(false)
  }

  const canSave = apiKey.trim().length > 0 && baseUrl.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[200] sm:max-w-md" overlayClassName="z-[200]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{editingProvider ? '编辑服务商' : '添加服务商'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>类型</Label>
            <Select value={type} onValueChange={(v) => handleTypeChange(v as AIProviderType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>名称（可选）</Label>
            <Input
              placeholder={type === 'openai' ? 'OpenAI' : 'Anthropic'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>API Key</Label>
            <Input
              type="password"
              placeholder={type === 'openai' ? 'sk-...' : 'sk-ant-...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Base URL</Label>
            <Input
              placeholder={DEFAULT_BASE_URLS[type]}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>模型</Label>
            <ModelCombobox
              type={type}
              apiKey={apiKey}
              baseUrl={baseUrl}
              value={model}
              onChange={setModel}
            />
          </div>

          {/* 测试连接 */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing || !apiKey || !baseUrl}
            >
              {testing ? '测试中...' : '测试连接'}
            </Button>
            {testResult && (
              <span className={`text-xs ${testResult.success ? 'text-green-600' : 'text-destructive'}`}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
