import { validateRemoteUrl } from '@marchen/shared/media/remote'
import { jotaiStore } from '@renderer/atoms/store'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { describeError } from '@renderer/lib/errors'
import { isWeb } from '@renderer/lib/utils'
import {
  usePlayerLoadingService,
  usePlayerLoadingState,
} from '@renderer/services/player-loading/hooks'
import { markNextPlayerImportSource } from '@renderer/services/telemetry/player-loading-observer'
import { atom, useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RemoteReadProgress } from './RemoteReadProgress'

const remoteDialogAtom = atom<{ url: string; recordId?: string } | null>(null)
export const openRemoteVideoDialog = (url = '', recordId?: string) => {
  if (!isWeb) jotaiStore.set(remoteDialogAtom, { url, recordId })
}

export function RemoteVideoDialog() {
  const [request, setRequest] = useAtom(remoteDialogAtom)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const submittedRef = useRef(false)
  const service = usePlayerLoadingService()
  const state = usePlayerLoadingState()
  const { t } = useTranslation(['player', 'common', 'errors'])
  const busy = submittedRef.current && state.step === 'importing'
  useEffect(() => {
    setUrl(request?.url ?? '')
    setError('')
    submittedRef.current = false
  }, [request])
  useEffect(() => {
    if (!submittedRef.current) return
    // 网络视频的错误码是裸的（access、range 等，见 RemoteMediaError），归到 remoteMedia 域
    if (state.step === 'error')
      setError(describeError(state.error, t('errors:generic.openVideo'), { domain: 'remoteMedia' }))
    else if (state.step !== 'importing' && state.step !== 'idle') {
      submittedRef.current = false
      setRequest(null)
    }
  }, [state, setRequest, t])
  const close = () => {
    if (submittedRef.current && state.step === 'importing') service.cancel()
    submittedRef.current = false
    setRequest(null)
  }
  const submit = (asNew = false) => {
    try {
      const valid = validateRemoteUrl(url)
      submittedRef.current = true
      setError('')
      markNextPlayerImportSource('remote_url')
      service.loadFromUrl(valid, asNew ? undefined : request?.recordId)
    } catch (error) {
      setError(describeError(error, t('remoteDialog.invalid'), { domain: 'remoteMedia' }))
    }
  }
  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        container={document.fullscreenElement ?? undefined}
        className="max-w-lg"
        aria-describedby="remote-video-description"
        // 防止编辑链接时误点遮罩关闭，保留 Esc 和显式关闭操作。
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {request?.recordId ? t('remoteDialog.titleChange') : t('remoteDialog.titleNew')}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy) submit()
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="remote-video-url" className="text-sm font-medium">
              {t('remoteDialog.urlLabel')}
            </label>
            <Input
              id="remote-video-url"
              aria-describedby={
                error ? 'remote-video-description remote-video-error' : 'remote-video-description'
              }
              aria-invalid={Boolean(error)}
              autoFocus
              value={url}
              onChange={(event) => {
                setUrl(event.target.value)
                setError('')
              }}
              placeholder={t('remoteDialog.urlPlaceholder')}
              disabled={busy}
              className="focus-visible:ring-1 focus-visible:ring-offset-0"
            />
            <p id="remote-video-description" className="text-muted-foreground text-sm">
              {t('remoteDialog.hint')}
            </p>
            {error && (
              <p id="remote-video-error" role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>
          {busy && <RemoteReadProgress />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              {t('common:action.cancel')}
            </Button>
            {error && request?.recordId && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => submit(true)}
              >
                {t('remoteDialog.openAsNew')}
              </Button>
            )}
            <Button type="submit" className="gap-2" disabled={busy || !url.trim()} aria-busy={busy}>
              {busy && (
                <i
                  aria-hidden="true"
                  className="icon-[mingcute--loading-line] size-4 animate-spin motion-reduce:animate-none"
                />
              )}
              {busy ? t('remoteDialog.reading') : t('remoteDialog.start')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
