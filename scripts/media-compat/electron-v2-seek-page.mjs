export async function verifyV2Seek(fixturePath) {
  const { DandanplayAPI } = await import('/src/services/player-loading/adapters/dandanplay-api.ts')
  const originalMatch = DandanplayAPI.prototype.match
  DandanplayAPI.prototype.match = async () => ({ isMatched: false, matches: [] })
  const { getPlayerLoadingService } = await import('/src/services/player-loading/index.ts')
  const s = getPlayerLoadingService()
  s.cancel()
  await new Promise((r) => setTimeout(r, 300))
  s.loadFromPath(fixturePath)
  const wait = async (f, ms = 15000) => {
    const deadline = performance.now() + ms
    while (!f()) {
      if (s.currentState.step === 'waiting_user') {
        const button = [...document.querySelectorAll('button')].find(
          (b) => b.textContent.trim() === '不加载弹幕',
        )
        if (button) button.click()
        else s.skipDanmaku()
      }
      if (performance.now() > deadline)
        throw new Error('timeout: ' + document.body.innerText.slice(-500))
      await new Promise((r) => setTimeout(r, 40))
    }
  }
  const steps = []
  try {
    await wait(() => document.querySelector('video')?.readyState >= 2)
    const v = document.querySelector('video')
    const source = v.currentSrc
    await Promise.race([
      v.play(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('play timeout')), 10000)),
    ])
    await wait(() => v.currentTime > 0.5)
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const c = canvas.getContext('2d', { willReadFrequently: true })
    const content = () => {
      c.drawImage(v, 0, 0, 320, 180)
      let n = 0
      for (let b = 0; b < 12; b++)
        if (c.getImageData(b * 24 + 12, 8, 1, 1).data[0] > 128) n += 2 ** b
      return n / 24
    }
    const frame = () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('video frame callback timed out')), 2000)
        v.requestVideoFrameCallback((now, m) => {
          clearTimeout(timer)
          resolve({
            time: v.currentTime,
            mediaTime: m.mediaTime,
            content: content(),
            expectedDisplayDelayMs: m.expectedDisplayTime - now,
          })
        })
      })
    for (const target of [8, 100, 8, 117, 1]) {
      v.currentTime = target
      await Promise.race([
        v.play(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('play timeout')), 10000)),
      ])
      await wait(() => !v.seeking && v.currentTime > target + 0.5 && v.readyState >= 2, 10000)
      steps.push({
        target,
        ...(await frame()),
        sameSource: v.currentSrc === source,
        frames: v.getVideoPlaybackQuality().totalVideoFrames,
      })
    }
    v.currentTime = 44
    v.currentTime = 90
    v.currentTime = 12
    await Promise.race([
      v.play(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('play timeout')), 10000)),
    ])
    await wait(() => !v.seeking && v.currentTime > 12.5, 10000)
    steps.push({ target: 12, ...(await frame()), sameSource: v.currentSrc === source })
    v.pause()
    return {
      ok: steps.every(
        (s) =>
          s.sameSource &&
          s.time < s.target + 2 &&
          Math.abs(s.time - s.content) < 0.15 &&
          Math.abs(s.mediaTime - s.content) < 0.15,
      ),
      steps,
      userAgent: navigator.userAgent,
    }
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      steps,
      step: s.currentState.step,
      text: document.body.innerText.slice(-1200),
    }
  } finally {
    DandanplayAPI.prototype.match = originalMatch
    s.cancel()
  }
}
