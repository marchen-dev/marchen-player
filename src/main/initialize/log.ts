import fs from 'node:fs'
import path from 'node:path'

import { configureDiagnosticLog, flushDiagnosticLog } from '@main/lib/diagnostic-log'
import { app } from 'electron'

/**
 * 初始化本地诊断日志：配置输出、清理旧目录、退出前写出待补汇总。
 * 日志始终开启，不受遥测开关影响。
 */
export const registerLog = () => {
  configureDiagnosticLog()
  removeLegacyLogDirectory()
  // 合并窗口中的重复计数只在窗口结束时写出，退出前必须同步补写
  app.on('will-quit', () => flushDiagnosticLog())
}

/** 旧版日志写在 <userData>/log/main.log，内容几乎只有更新告警，直接删除不迁移 */
function removeLegacyLogDirectory() {
  const legacy = path.join(app.getPath('userData'), 'log')
  if (path.basename(legacy) !== 'log') return
  fs.rm(legacy, { recursive: true, force: true }, () => {})
}
