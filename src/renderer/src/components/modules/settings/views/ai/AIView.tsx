import { useAISettings } from '@renderer/atoms/settings/ai'
import { Button } from '@renderer/components/ui/button'
import { useState } from 'react'

import {
  FieldsCardLayout,
  SettingViewContainer,
} from '../Layout'
import { ProviderCard } from './ProviderCard'
import { ProviderDialog } from './ProviderDialog'

export const AIView = () => {
  const [settings, setSettings] = useAISettings()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleAdd = () => {
    setEditingId(null)
    setDialogOpen(true)
  }

  const handleEdit = (id: string) => {
    setEditingId(id)
    setDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    setSettings((prev) => {
      const providers = prev.providers.filter((p) => p.id !== id)
      const activeProviderId = prev.activeProviderId === id ? null : prev.activeProviderId
      return { ...prev, providers, activeProviderId }
    })
  }

  const handleActivate = (id: string) => {
    setSettings((prev) => ({ ...prev, activeProviderId: id }))
  }

  return (
    <SettingViewContainer>
      <FieldsCardLayout title="服务商配置">
        {settings.providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂未配置 AI 服务商</p>
        ) : (
          <div className="space-y-2">
            {settings.providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isActive={provider.id === settings.activeProviderId}
                onActivate={() => handleActivate(provider.id)}
                onEdit={() => handleEdit(provider.id)}
                onDelete={() => handleDelete(provider.id)}
              />
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" onClick={handleAdd}>
          + 添加服务商
        </Button>
      </FieldsCardLayout>

      <ProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingProvider={editingId ? settings.providers.find((p) => p.id === editingId) : undefined}
      />
    </SettingViewContainer>
  )
}
