import { Button } from '@renderer/components/ui/button'
import { useModalStack } from '@renderer/components/ui/modal'
import { tipcClient } from '@renderer/lib/client'
import { isWeb } from '@renderer/lib/utils'
import { useCallback } from 'react'

interface showConfirmationBox {
  title: string
  handleConfirm?: () => void
  handleCancel?: () => void
}

export const useConfirmationDialog = () => {
  const { present } = useModalStack()

  return useCallback(
    (params: showConfirmationBox) => {
      if (isWeb) {
        return present({
          id: 'DIALOG',
          title: params.title,
          overlay: true,
          content: ({ dismiss }) => (
            <div className="mt-3 flex justify-end gap-2">
              <Button
                onClick={() => {
                  params.handleCancel?.()
                  dismiss()
                }}
                variant={'outline'}
              >
                取消
              </Button>
              <Button
                onClick={() => {
                  params.handleConfirm?.()
                  dismiss()
                }}
                variant={'destructive'}
              >
                确认
              </Button>
            </div>
          ),
        })
      }
      tipcClient?.confirmationDialog({ title: params.title }).then((result) => {
        if (!result) {
          return params.handleCancel?.()
        }
        params.handleConfirm?.()
      })
      return
    },
    [present],
  )
}
