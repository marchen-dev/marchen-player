import type { MediaSourceKind, MediaSourceSummary } from '@marchen/shared/media-sources'
import { MEDIA_SOURCE_KIND_LABELS, MEDIA_SOURCE_KINDS } from '@marchen/shared/media-sources'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { useId, useState } from 'react'
import { useSaveMediaSource } from './api'

export type SourceFormRequest =
  | { mode: 'add' }
  | { mode: 'edit'; source: MediaSourceSummary }
  | { mode: 'relogin'; source: MediaSourceSummary }

const URL_PLACEHOLDER: Record<MediaSourceKind, string> = {
  webdav: 'https://nas.local/dav/',
  jellyfin: 'http://192.168.1.2:8096',
  emby: 'http://192.168.1.2:8096',
}

const URL_HINT: Record<MediaSourceKind, string> = {
  webdav: '填写 WebDAV 根目录地址，例如 alist 的 /dav/',
  jellyfin: '填写服务器地址，不需要带 /web',
  emby: '填写服务器地址，不需要带 /web',
}

const TITLE = { add: '添加媒体源', edit: '编辑媒体源', relogin: '重新登录' } as const

interface SourceFormDialogProps {
  request: SourceFormRequest | null
  onClose: () => void
  onSaved: (source: MediaSourceSummary) => void
}

/** 每次打开都重新挂载表单，字段直接从请求初始化，不需要在 effect 里重置 */
export function SourceFormDialog({ request, ...props }: SourceFormDialogProps) {
  return request ? <SourceForm request={request} {...props} /> : null
}

function SourceForm({
  request,
  onClose,
  onSaved,
}: Omit<SourceFormDialogProps, 'request'> & { request: SourceFormRequest }) {
  const id = useId()
  const save = useSaveMediaSource()
  const current = request.mode !== 'add' ? request.source : undefined
  const [kind, setKind] = useState<MediaSourceKind>(current?.kind ?? 'jellyfin')
  const [name, setName] = useState(current?.name ?? '')
  const [url, setUrl] = useState(current?.url ?? '')
  const [username, setUsername] = useState(current?.username ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const relogin = request.mode === 'relogin'
  // 编辑时只改名称不需要密码；改了地址、账号或类型才需要重新输入密码。
  // 添加时不强制：WebDAV 可匿名访问，Jellyfin/Emby 也允许空密码账号
  const targetChanged =
    !current ||
    current.kind !== kind ||
    current.url !== url.trim() ||
    current.username !== username.trim()
  const passwordRequired = request.mode === 'edit' && targetChanged

  const close = () => {
    if (save.isPending) return
    onClose()
  }

  const submit = () => {
    if (save.isPending) return
    const input = {
      kind,
      name: name.trim() || MEDIA_SOURCE_KIND_LABELS[kind],
      url: url.trim(),
      username: username.trim(),
      password,
    }
    if (!input.url) return setError('请填写服务器地址')
    if (passwordRequired && !password) return setError('请输入密码')
    setError('')
    save.mutate(
      request.mode === 'add'
        ? { action: 'add', input }
        : request.mode === 'edit'
          ? { action: 'update', id: request.source.id, input }
          : { action: 'relogin', id: request.source.id, kind: request.source.kind, password },
      {
        onSuccess: (source) => onSaved(source),
        onError: (cause) => setError(cause instanceof Error ? cause.message : '连接失败'),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="max-w-md"
        aria-describedby={`${id}-description`}
        // 填写表单时误点遮罩不关闭，保留 Esc 和显式取消
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{TITLE[request.mode]}</DialogTitle>
        </DialogHeader>
        <p id={`${id}-description`} className="text-muted-foreground -mt-2 text-sm">
          {relogin
            ? `登录已失效，请重新输入「${current?.name}」的密码。`
            : '保存前会先测试连接，账号信息只保存在本机。'}
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          {!relogin && (
            <div className="space-y-2">
              <span className="text-sm font-medium">类型</span>
              <div className="bg-muted flex rounded-xl p-1" role="radiogroup" aria-label="类型">
                {MEDIA_SOURCE_KINDS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant="ghost"
                    role="radio"
                    aria-checked={kind === value}
                    disabled={save.isPending}
                    className={
                      kind === value
                        ? 'bg-background text-foreground hover:bg-background hover:text-foreground flex-1 shadow-sm'
                        : 'flex-1'
                    }
                    onClick={() => {
                      setKind(value)
                      setError('')
                    }}
                  >
                    {MEDIA_SOURCE_KIND_LABELS[value]}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {!relogin && (
            <>
              <Field id={`${id}-name`} label="名称">
                <Input
                  id={`${id}-name`}
                  value={name}
                  placeholder={MEDIA_SOURCE_KIND_LABELS[kind]}
                  maxLength={100}
                  disabled={save.isPending}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field id={`${id}-url`} label="服务器地址" hint={URL_HINT[kind]}>
                <Input
                  id={`${id}-url`}
                  value={url}
                  autoFocus={request.mode === 'add'}
                  placeholder={URL_PLACEHOLDER[kind]}
                  disabled={save.isPending}
                  spellCheck={false}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    setError('')
                  }}
                />
              </Field>
              <Field id={`${id}-username`} label="用户名">
                <Input
                  id={`${id}-username`}
                  value={username}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={save.isPending}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </Field>
            </>
          )}
          <Field
            id={`${id}-password`}
            label="密码"
            hint={
              request.mode === 'edit' && !targetChanged ? '不修改地址和账号时可以留空' : undefined
            }
          >
            <Input
              id={`${id}-password`}
              type="password"
              value={password}
              autoComplete="off"
              autoFocus={relogin}
              disabled={save.isPending}
              onChange={(event) => {
                setPassword(event.target.value)
                setError('')
              }}
            />
          </Field>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={save.isPending}>
              取消
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? '正在连接…' : relogin ? '登录' : '测试并保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
