// DOMParser 需要真实浏览器。先启动 pnpm dev:web，再用 node 执行本文件。
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(process.env.DANMAKU_TEST_URL ?? 'http://127.0.0.1:1106')
    const result = await page.evaluate(async () => {
      const { parseLocalDanmaku, readLocalDanmaku } = await import('/src/lib/local-danmaku.ts')
      const parsed = parseLocalDanmaku(
        '<i><chatserver>元信息</chatserver><d p="1.25,5,25,0,123">中文 &amp; 黑色</d><d p="2,7,25,1,0">高级</d><d p="NaN,1,25,1,0">无效</d></i>',
        'xml',
      )
      const errors = []
      for (const text of ['<i>', '<wrong/>', '<i/>', '<i><d p="0,9,25,1,0">特殊</d></i>']) {
        try {
          parseLocalDanmaku(text, 'xml')
          errors.push(null)
        } catch (error) {
          errors.push(error.message)
        }
      }
      // 多条目大文件，验证去掉阈值后仍能读取并统计，避免只用一条巨长文字代表全部情况。
      const text = `<i>${  '<d p="1,1,25,16777215,0">测试弹幕</d>'.repeat(300000)  }</i>`
      const file = new File([text], 'large.xml')
      const large = await readLocalDanmaku(file)
      return {
        parsed,
        errors,
        bytes: file.size,
        count: large.entry.content.count,
        skipped: large.skippedCount,
      }
    })
    assert.deepEqual(result.parsed, {
      comments: [{ cid: 123, m: '中文 & 黑色', p: '1.25,5,#000000,123' }],
      skippedCount: 2,
    })
    assert(result.errors[0].includes('格式不正确'))
    assert(result.errors[1].includes('格式不正确'))
    assert(result.errors[2].includes('没有可导入'))
    assert(result.errors[3].includes('没有可导入'))
    assert(result.bytes > 10 * 1024 * 1024)
    assert.equal(result.count, 300000)
    assert.equal(result.skipped, 0)
    process.stdout.write('XML 结构、逐条容错、统计、实体、颜色及超过 10 MB 多条目回归通过\n')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
