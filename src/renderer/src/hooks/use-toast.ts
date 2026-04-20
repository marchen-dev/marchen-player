import { useClearPlayingVideo } from '@renderer/atoms/player'
import { useToast } from '@renderer/components/ui/toast'
import { ipcClient } from '@renderer/lib/client'
import { isWeb } from '@renderer/lib/utils'
import { useCallback } from 'react'

export const usePlayAnimeFailedToast = () => {
  const toast = useAppToast()
  const reset = useClearPlayingVideo()

  const showFailedToast = useCallback(
    (params: { title: string; description: string; duration?: number }) => {
      const { title, description, duration } = params
      reset()
      toast({
        title,
        description,
        variant: 'destructive',
        duration,
      })
    },
    [toast, reset],
  )
  return {
    showFailedToast,
  }
}

const useAppToast = () => {
  const { toast } = useToast()

  return useCallback(
    (params: {
      title: string
      description: string
      variant?: 'default' | 'destructive'
      duration?: number
    }) => {
      const { title, description, duration, variant = 'default' } = params
      if (isWeb) {
        return toast({
          title,
          description,
          variant,
          duration,
        })
      }

      return ipcClient?.player.showWarningDialog({ title, content: description })
    },
    [toast],
  )
}
