import { version } from '@pkg'
import { Logo } from '@renderer/components/icons/Logo'
import { Button } from '@renderer/components/ui/button'
import { tipcClient } from '@renderer/lib/client'
import { isWeb } from '@renderer/lib/utils'
import { useMutation } from '@tanstack/react-query'

import { FieldsCardLayout, SettingViewContainer } from '../Layout'

export const AboutView = () => {
  const { mutate, isPending } = useMutation({
    mutationFn: async () => tipcClient?.checkUpdate(),
  })
  return (
    <SettingViewContainer>
      <FieldsCardLayout className="bg-zinc-50 dark:bg-zinc-900">
        <div className="m-3 flex items-center justify-between">
          <div className="flex gap-3">
            <Logo round clasNames={{ wrapper: 'size-20 border' }} />
            <div className="flex flex-col gap-1">
              <h4 className="text-lg font-medium">Marchen</h4>
              <div className="text-sm text-zinc-500">
                <p>当前版本: {version}</p>
                <p>Copyright @ 2024 Suemor</p>
              </div>
            </div>
          </div>
          {!isWeb && (
            <Button onClick={() => mutate()} disabled={isPending} variant="outline">
              检查更新
            </Button>
          )}
        </div>
      </FieldsCardLayout>
    </SettingViewContainer>
  )
}
