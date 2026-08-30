import type { RequestListener, Server, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { createServer } from 'node:http'

export type MediaGatewayRequestHandler = RequestListener

export class MediaGatewayServer {
  #server: Server | undefined
  #baseUrl: string | undefined
  #startPromise: Promise<string> | undefined
  readonly #sockets = new Set<Socket>()

  constructor(private readonly handler: MediaGatewayRequestHandler = notFound) {}

  get url(): string | undefined {
    return this.#baseUrl
  }

  start(): Promise<string> {
    if (this.#baseUrl) return Promise.resolve(this.#baseUrl)
    if (this.#startPromise) return this.#startPromise

    this.#startPromise = new Promise<string>((resolve, reject) => {
      const server = createServer((request, response) => {
        Promise.resolve(this.handler(request, response)).catch(() => {
          if (!response.headersSent) response.writeHead(500)
          response.end()
        })
      })
      this.#server = server
      server.on('connection', (socket) => {
        this.#sockets.add(socket)
        socket.once('close', () => this.#sockets.delete(socket))
      })
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          reject(new Error('Media Gateway 未取得 TCP 地址'))
          return
        }
        this.#baseUrl = `http://127.0.0.1:${address.port}`
        resolve(this.#baseUrl)
      })
    }).finally(() => {
      this.#startPromise = undefined
    })
    return this.#startPromise
  }

  async stop(): Promise<void> {
    const server = this.#server
    this.#server = undefined
    this.#baseUrl = undefined
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
      server.closeIdleConnections?.()
      for (const socket of this.#sockets) socket.destroy()
    })
    this.#sockets.clear()
  }
}

function notFound(_request: unknown, response: ServerResponse): void {
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not Found')
}
