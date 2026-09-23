import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { loadSparkleBridge } from './index.ts'

it('缺少原生模块时返回降级信息，不抛出到主进程', () => {
  const result = loadSparkleBridge('/nonexistent/marchen/sparkle.node')
  assert.equal(result.available, false)
  if (!result.available) assert.ok(result.reason)
})
it('缺少必要导出时拒绝加载，不把旧接口当作成功', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marchen-sparkle-'))
  try {
    const file = join(dir, 'incomplete.cjs')
    writeFileSync(file, 'module.exports = { initialize() {} }')
    assert.equal(loadSparkleBridge(file).available, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
