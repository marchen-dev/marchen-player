import {
  formatMediaBytes,
  remoteImportProgressAtom,
} from '@renderer/services/media/remote-progress'
import { useAtomValue } from 'jotai'

export function RemoteReadProgress() {
  const progress = useAtomValue(remoteImportProgressAtom)
  if (!progress) return null
  const percent = progress.total
    ? Math.min(100, Math.floor((progress.received / progress.total) * 100))
    : 0
  return (
    <div className="w-full max-w-sm space-y-2 text-sm">
      <p className="text-muted-foreground">
        {progress.stage === 'connecting' ? '正在连接视频来源…' : '正在读取视频识别数据…'}
      </p>
      {progress.stage === 'reading' && (
        <>
          <div
            role="progressbar"
            aria-label="视频识别数据读取进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="bg-muted h-1.5 overflow-hidden rounded-full"
          >
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatMediaBytes(progress.received)} / {formatMediaBytes(progress.total)} · {percent}%
          </p>
        </>
      )}
    </div>
  )
}
