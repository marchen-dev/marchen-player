import { describe, expect, it, vi } from 'vitest'
import { createWebdavProvider, parseMultistatus, webdavFactory, webdavUrl } from './webdav'

const root = new URL('https://nas.local/dav/')

/** nginx（dav_ext）：D: 前缀，href 为已编码的绝对路径 */
const nginx = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
<D:response><D:href>/dav/%E7%95%AA%E5%89%A7/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
<D:response><D:href>/dav/%E7%95%AA%E5%89%A7/EP10.mkv</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>2048</D:getcontentlength></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
<D:response><D:href>/dav/%E7%95%AA%E5%89%A7/EP2.mkv</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>1024</D:getcontentlength></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
<D:response><D:href>/dav/%E7%95%AA%E5%89%A7/EP2.sc.ass</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>10</D:getcontentlength></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
<D:response><D:href>/dav/%E7%95%AA%E5%89%A7/cover.jpg</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>10</D:getcontentlength></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
<D:response><D:href>/dav/%E7%95%AA%E5%89%A7/SPs/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
</D:multistatus>`

/** Apache mod_dav：lp1 前缀混用，未请求到的属性单独一个 404 propstat */
const apache = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:ns0="DAV:">
<D:response xmlns:lp1="DAV:"><D:href>/dav/</D:href><D:propstat><D:prop><lp1:resourcetype><D:collection/></lp1:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
<D:response xmlns:lp1="DAV:"><D:href>/dav/a%20b.mp4</D:href><D:propstat><D:prop><ns0:getcontentlength/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat><D:propstat><D:prop><lp1:resourcetype/><lp1:getcontentlength>99</lp1:getcontentlength></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
</D:multistatus>`

/** alist：小写 d: 前缀，href 未编码中文 */
const alist = `<?xml version="1.0" encoding="UTF-8"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection xmlns:d="DAV:"/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response><d:response><d:href>/dav/葬送的芙莉莲/</d:href><d:propstat><d:prop><d:resourcetype><d:collection xmlns:d="DAV:"/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`

/** rclone serve webdav：无前缀默认命名空间，href 为绝对地址 */
const rclone = `<?xml version="1.0" encoding="UTF-8"?><multistatus xmlns="DAV:"><response><href>https://nas.local/dav/</href><propstat><prop><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response><response><href>https://nas.local/dav/movie.webm</href><propstat><prop><resourcetype></resourcetype><getcontentlength>5</getcontentlength></prop><status>HTTP/1.1 200 OK</status></propstat></response><response><href>https://nas.local/other/x.mkv</href><propstat><prop><resourcetype/></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`

describe('webDAV multistatus 解析', () => {
  it('nginx：解码路径、识别目录与大小', () => {
    const entries = parseMultistatus(nginx, root)
    expect(entries[0]).toMatchObject({ ref: '/番剧', directory: true })
    expect(entries).toContainEqual({
      ref: '/番剧/EP2.mkv',
      name: 'EP2.mkv',
      directory: false,
      size: 1024,
    })
  })

  it('apache：取 200 的 propstat，空格路径解码', () => {
    expect(parseMultistatus(apache, root)).toEqual([
      { ref: '/', name: '', directory: true, size: undefined },
      { ref: '/a b.mp4', name: 'a b.mp4', directory: false, size: 99 },
    ])
  })

  it('alist：未编码中文 href', () => {
    expect(parseMultistatus(alist, root)[1]).toMatchObject({
      ref: '/葬送的芙莉莲',
      directory: true,
    })
  })

  it('rclone：绝对地址 href，丢弃根目录之外的条目', () => {
    expect(parseMultistatus(rclone, root).map((entry) => entry.ref)).toEqual(['/', '/movie.webm'])
  })

  it('非 XML 响应视为无效', () => {
    expect(() => parseMultistatus('<html>login</html>', root)).toThrow()
  })
})

describe('webDAV 地址拼接', () => {
  it('逐段编码，拒绝越出根目录', () => {
    expect(webdavUrl(root, '/番剧/EP 1.mkv')).toBe(
      'https://nas.local/dav/%E7%95%AA%E5%89%A7/EP%201.mkv',
    )
    expect(webdavUrl(root, '/番剧', true)).toBe('https://nas.local/dav/%E7%95%AA%E5%89%A7/')
    expect(() => webdavUrl(root, '/../etc/passwd')).toThrow()
  })
})

function davServer(listing: string, files: Record<string, string> = {}) {
  return vi.fn<typeof fetch>(async (url, init) => {
    const auth = new Headers(init?.headers).get('Authorization')
    if (auth !== `Basic ${Buffer.from('me:secret').toString('base64')}`)
      return new Response(null, { status: 401 })
    if (init?.method === 'PROPFIND') return new Response(listing, { status: 207 })
    const body = files[new URL(String(url)).pathname]
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body)
  })
}

describe('webDAV provider', () => {
  it('浏览：文件夹在前、自然排序、只保留视频', async () => {
    vi.stubGlobal('fetch', davServer(nginx))
    try {
      const provider = createWebdavProvider(root.href, 'me', 'secret')
      const result = await provider.browse('/番剧')
      expect(result.title).toBe('番剧')
      expect(result.nodes.map((node) => node.title)).toEqual(['SPs', 'EP2.mkv', 'EP10.mkv'])
      expect(result.nodes[1]).toMatchObject({ type: 'video', size: 1024 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('同目录连播与前缀匹配的外挂字幕', async () => {
    vi.stubGlobal(
      'fetch',
      davServer(nginx, { '/dav/%E7%95%AA%E5%89%A7/EP2.sc.ass': '[Script Info]' }),
    )
    try {
      const provider = createWebdavProvider(root.href, 'me', 'secret')
      expect((await provider.siblings('/番剧/EP2.mkv')).map((node) => node.ref)).toEqual([
        '/番剧/EP2.mkv',
        '/番剧/EP10.mkv',
      ])
      const subtitles = await provider.subtitles('/番剧/EP2.mkv')
      expect(subtitles).toEqual([{ id: 'EP2.sc.ass', title: 'EP2.sc.ass', format: 'ass' }])
      expect(await provider.readSubtitle('/番剧/EP2.mkv', 'EP2.sc.ass')).toBe('[Script Info]')
      await expect(provider.readSubtitle('/番剧/EP2.mkv', '../secret.ass')).rejects.toMatchObject({
        code: 'not_found',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('连接：规范化地址，密码错误映射为 auth_failed', async () => {
    vi.stubGlobal('fetch', davServer(apache))
    try {
      await expect(
        webdavFactory.connect(
          { url: 'https://nas.local/dav', username: 'me', password: 'secret' },
          'd',
        ),
      ).resolves.toMatchObject({ url: 'https://nas.local/dav/' })
      await expect(
        webdavFactory.connect(
          { url: 'https://nas.local/dav', username: 'me', password: 'bad' },
          'd',
        ),
      ).rejects.toMatchObject({ code: 'auth_failed' })
      await expect(
        webdavFactory.connect({ url: 'ftp://nas.local', username: '', password: '' }, 'd'),
      ).rejects.toMatchObject({ code: 'invalid_input' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
