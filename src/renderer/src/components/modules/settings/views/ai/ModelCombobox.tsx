import type { AIProviderType } from '@renderer/request/models/ai'
import type { FC } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@renderer/components/ui/popover'
import { apiClient } from '@renderer/request'
import { PRESET_MODELS } from '@renderer/request/models/ai'
import { useCallback, useState } from 'react'

interface ModelComboboxProps {
  type: AIProviderType
  apiKey: string
  baseUrl: string
  value: string
  onChange: (value: string) => void
}

export const ModelCombobox: FC<ModelComboboxProps> = ({
  type,
  apiKey,
  baseUrl,
  value,
  onChange,
}) => {
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<string[]>(PRESET_MODELS[type])
  const [fetching, setFetching] = useState(false)
  const [filter, setFilter] = useState('')

  const handleFetchModels = useCallback(async () => {
    if (!apiKey || !baseUrl) return
    setFetching(true)
    try {
      const result = await apiClient.ai.fetchModels(type, apiKey, baseUrl)
      if (result.length > 0) {
        setModels(result.map((m) => m.id))
      }
    } catch {
      setModels(PRESET_MODELS[type])
    }
    setFetching(false)
  }, [type, apiKey, baseUrl])

  const filteredModels = filter
    ? models.filter((m) => m.toLowerCase().includes(filter.toLowerCase()))
    : models

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button variant="outline" className="flex-1 justify-start font-normal">
            {value || '选择模型...'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start" avoidCollisions onWheel={(e) => e.stopPropagation()}>
          <Input
            placeholder="搜索或输入模型名..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filter) {
                onChange(filter)
                setOpen(false)
                setFilter('')
              }
            }}
            className="mb-2"
          />
          <div className="max-h-40 overflow-y-auto overscroll-contain" onWheel={(e) => e.stopPropagation()}>
            {filteredModels.map((m) => (
              <button
                key={m}
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange(m)
                  setOpen(false)
                  setFilter('')
                }}
              >
                {m}
              </button>
            ))}
            {filteredModels.length === 0 && filter && (
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                onClick={() => {
                  onChange(filter)
                  setOpen(false)
                  setFilter('')
                }}
              >
                使用「{filter}」
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 p-2"
        onClick={handleFetchModels}
        disabled={fetching || !apiKey || !baseUrl}
        title="获取模型列表"
      >
        <i className={`icon-[mingcute--refresh-2-line] text-sm ${fetching ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  )
}
