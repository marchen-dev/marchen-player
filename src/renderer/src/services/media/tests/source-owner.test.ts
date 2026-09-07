import { expect, it, vi } from 'vitest'
import { MediaSourceOwner } from '../source-owner'

it('共享 Input，释放字幕租约不关闭播放来源，最后释放只关闭一次', async () => {
  const release = vi.fn()
  const owner = new MediaSourceOwner({
    kind: 'electron',
    source: { size: 4, read: async (s, e) => new Uint8Array(e - s) },
    release,
  })
  const video = owner.acquire()
  const subtitle = owner.acquire()
  expect(video.input).toBe(subtitle.input)
  subtitle.release()
  subtitle.release()
  expect(subtitle.signal.aborted).toBe(true)
  expect(video.signal.aborted).toBe(false)
  expect(release).not.toHaveBeenCalled()
  expect((await video.source.read(0, 4)).length).toBe(4)
  video.release()
  owner.close()
  expect(release).toHaveBeenCalledTimes(1)
  expect(() => owner.acquire()).toThrow('已关闭')
})
it('关闭期间的迟到读取被取消，不依赖底层实现主动取消', async () => {
  let done!: (value: Uint8Array) => void
  const owner = new MediaSourceOwner({
    kind: 'electron',
    source: {
      size: 4,
      read: () =>
        new Promise((resolve) => {
          done = resolve
        }),
    },
    release: vi.fn(),
  })
  const lease = owner.acquire()
  const read = lease.source.read(0, 4)
  owner.close()
  done(new Uint8Array(4))
  await expect(read).rejects.toThrow()
  lease.release()
})
it('web Blob 与媒体库 Input 共享相同文件，越界与短读明确失败', async () => {
  const owner = new MediaSourceOwner({ kind: 'web', file: new File(['abcd'], 'sample.mkv') })
  const lease = owner.acquire()
  expect(new TextDecoder().decode(await lease.source.read(1, 3))).toBe('bc')
  await expect(lease.source.read(0, 5)).rejects.toThrow('越界')
  lease.release()
})
