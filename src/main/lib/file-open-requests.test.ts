import { describe, expect, it, vi } from 'vitest'
import { FileOpenRequests } from './file-open-requests'

describe('系统文件打开请求', () => {
  it('冷启动先缓存，窗口创建后仍等待渲染监听就绪，且只投递一次', () => {
    const requests = new FileOpenRequests()
    const wake = vi.fn()
    const deliver = vi.fn()
    requests.request('/视频/第一集.mkv')
    requests.setWindowOpener(wake)
    expect(wake).toHaveBeenCalledOnce()
    expect(deliver).not.toHaveBeenCalled()
    requests.rendererReady(deliver)
    requests.rendererReady(deliver)
    expect(deliver).toHaveBeenCalledExactlyOnceWith('/视频/第一集.mkv')
  })

  it('启动过程中连续打开保留最新意图，运行中可以再次打开同一文件', () => {
    const requests = new FileOpenRequests()
    const deliver = vi.fn()
    requests.request('/first.mp4')
    requests.request('/last.mkv')
    requests.rendererReady(deliver)
    expect(deliver).toHaveBeenCalledExactlyOnceWith('/last.mkv')
    requests.request('/last.mkv')
    expect(deliver).toHaveBeenCalledTimes(2)
  })

  it('窗口关闭或重载后不向旧页面投递，新页面就绪后继续打开', () => {
    const requests = new FileOpenRequests()
    const oldPage = vi.fn()
    const newPage = vi.fn()
    requests.rendererReady(oldPage)
    requests.rendererUnavailable()
    requests.setWindowOpener(vi.fn())
    requests.request('/next.mkv')
    expect(oldPage).not.toHaveBeenCalled()
    requests.rendererReady(newPage)
    expect(newPage).toHaveBeenCalledExactlyOnceWith('/next.mkv')
  })

  it('唤醒过程若重建窗口，必须等待新窗口就绪', () => {
    const requests = new FileOpenRequests()
    const oldPage = vi.fn()
    requests.rendererReady(oldPage)
    requests.setWindowOpener(() => requests.rendererUnavailable())
    requests.request('/next.mp4')
    expect(oldPage).not.toHaveBeenCalled()
    const newPage = vi.fn()
    requests.rendererReady(newPage)
    expect(newPage).toHaveBeenCalledExactlyOnceWith('/next.mp4')
  })

  it('windows 启动参数和二次启动共用入口，忽略非视频参数', () => {
    const requests = new FileOpenRequests()
    const deliver = vi.fn()
    const wake = vi.fn()
    requests.setWindowOpener(wake)
    requests.rendererReady(deliver)
    requests.requestFromArgv(['Marchen.exe', '--flag'])
    expect(wake).not.toHaveBeenCalled()
    requests.requestFromArgv(['Marchen.exe', 'C:\\Anime\\EP01.MKV'])
    expect(deliver).toHaveBeenCalledExactlyOnceWith('C:\\Anime\\EP01.MKV')
  })
})
