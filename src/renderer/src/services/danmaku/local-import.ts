import type { PlayerLoadingService } from '@marchen/player-loading'
import { LocalDanmakuImportError } from '@marchen/player-loading'
import { LocalDanmakuValidationError, readLocalDanmaku } from '@renderer/lib/local-danmaku'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'

/** 文件处理留在 Renderer；核心服务只接收标准来源，并负责会话与事务。 */
export async function importLocalDanmaku(
  file: File,
  service: Pick<PlayerLoadingService, 'sessionId' | 'currentState' | 'addLocalDanmaku'>,
  signal: AbortSignal,
) {
  const session = service.sessionId
  const initial = service.currentState
  if (initial.step !== 'ready' && initial.step !== 'waiting_user') return
  const current = () => service.sessionId === session && !signal.aborted
  let stage: 'read' | 'save' = 'read'
  try {
    const result = await readLocalDanmaku(file)
    const state = service.currentState
    if (
      !current() ||
      (state.step !== 'ready' && state.step !== 'waiting_user') ||
      state.video !== initial.video
    )
      return
    stage = 'save'
    await service.addLocalDanmaku(result.entry, session, signal)
    const updated = service.currentState
    // 成功转入 ready 会卸载等待弹窗；其清理触发的 abort 不应吞掉已完成的反馈。
    if (
      service.sessionId !== session ||
      updated.step !== 'ready' ||
      updated.video !== initial.video ||
      !updated.danmaku.includes(result.entry)
    )
      return
    return { ...result, hash: initial.video.hash }
  } catch (error) {
    if (!current() || (error instanceof LocalDanmakuImportError && error.code === 'stale')) return
    if (
      !(error instanceof LocalDanmakuValidationError) &&
      !(error instanceof LocalDanmakuImportError)
    ) {
      const failure = Object.assign(
        new Error(stage === 'read' ? '读取弹幕文件失败' : '保存弹幕失败', { cause: error }),
        {
          code: `local_danmaku_${stage}_failed`,
        },
      )
      reportOperationalError('player', 'local_danmaku_import', failure)
      throw new Error(
        stage === 'read' ? '读取弹幕文件失败，请重试' : '保存弹幕失败，请检查存储空间后重试',
        { cause: error },
      )
    }
    throw error
  }
}
