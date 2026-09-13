import { useAISettings } from '@renderer/atoms/settings/ai'
import { Button } from '@renderer/components/ui/button'
import { useRef, useState } from 'react'

import { SettingsGroup, SettingsPage, SettingsSection } from '../../components'
import { ProviderCard } from './ProviderCard'
import { ProviderDialog } from './ProviderDialog'

export const AIView = () => {
  const [settings, setSettings] = useAISettings()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const dialogTriggerRef = useRef<HTMLElement | null>(null)

  const handleAdd = (trigger: HTMLButtonElement) => {
    dialogTriggerRef.current = trigger
    setEditingId(null)
    setDialogOpen(true)
  }

  const handleEdit = (id: string, trigger: HTMLButtonElement) => {
    dialogTriggerRef.current = trigger
    setEditingId(id)
    setDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    setSettings((prev) => {
      const providers = prev.providers.filter((provider) => provider.id !== id)
      const activeProviderId = prev.activeProviderId === id ? null : prev.activeProviderId
      return { ...prev, providers, activeProviderId }
    })
  }

  const handleActivate = (id: string) => {
    setSettings((prev) => ({ ...prev, activeProviderId: id }))
  }

  return (
    <SettingsPage
      sectionId="ai"
      title="AI 服务"
      description="配置用于智能功能的模型服务商"
      action={
        <Button size="sm" onClick={(event) => handleAdd(event.currentTarget)}>
          <i className="icon-[mingcute--add-line] mr-1 text-base" aria-hidden="true" />
          添加服务商
        </Button>
      }
    >
      <SettingsSection
        title="服务商"
        description={
          settings.providers.length > 0
            ? `已配置 ${settings.providers.length} 个服务商`
            : '添加服务商后，可选择一个作为当前服务'
        }
      >
        {settings.providers.length === 0 ? (
          <SettingsGroup>
            <div className="flex min-h-40 flex-col items-center justify-center px-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-[var(--settings-selected)]">
                <i
                  className="icon-[mingcute--sparkles-2-line] text-xl text-[var(--settings-muted)]"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-3 text-sm font-medium">暂未配置 AI 服务商</p>
              <p className="mt-1 text-xs text-[var(--settings-muted)]">
                支持 OpenAI 与 Anthropic 兼容服务
              </p>
            </div>
          </SettingsGroup>
        ) : (
          <SettingsGroup>
            <div role="radiogroup" aria-label="当前 AI 服务商">
              {settings.providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  isActive={provider.id === settings.activeProviderId}
                  onActivate={() => handleActivate(provider.id)}
                  onEdit={(trigger) => handleEdit(provider.id, trigger)}
                  onDelete={() => handleDelete(provider.id)}
                />
              ))}
            </div>
          </SettingsGroup>
        )}
      </SettingsSection>

      <ProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        returnFocusRef={dialogTriggerRef}
        editingProvider={editingId ? settings.providers.find((p) => p.id === editingId) : undefined}
      />
    </SettingsPage>
  )
}
