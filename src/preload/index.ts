// src/preload/index.ts
import { electronAPI } from '@electron-toolkit/preload'
import { MarchenDecoder } from '@main/initialize/native-addon'
import { contextBridge, webUtils } from 'electron'

interface DecoderInstance {
  decoder: MarchenDecoder
  sharedBuffer: SharedArrayBuffer | null
  frameBuffer: Uint8ClampedArray | null
  metadata: any
}

const decoderInstances = new Map<number, DecoderInstance>()
let nextId = 0

const decoderAPI = {
  create(): number {
    const id = nextId++
    decoderInstances.set(id, {
      decoder: new MarchenDecoder(),
      sharedBuffer: null,
      frameBuffer: null,
      metadata: null,
    })
    return id
  },

  open(id: number, filePath: string, options?: { forceSoftwareDecode?: boolean }) {
    const instance = decoderInstances.get(id)
    if (!instance) throw new Error(`Decoder ${id} not found`)

    const metadata = instance.decoder.open(filePath, options)
    instance.metadata = metadata

    // 创建 SharedArrayBuffer
    instance.sharedBuffer = new SharedArrayBuffer(metadata.bufferSize)
    instance.frameBuffer = new Uint8ClampedArray(instance.sharedBuffer)
    instance.decoder.setVideoBuffer(instance.frameBuffer)

    // 通过 window.postMessage 发送 SharedArrayBuffer
    // 这个在 preload 中可以直接访问 window
    setTimeout(() => {
      window.postMessage({
        type: 'decoder-shared-buffer',
        decoderId: id,
        buffer: instance.sharedBuffer,
      }, '*')
    }, 0)

    return {
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      frameRate: metadata.frameRate,
      codecName: metadata.codecName,
      hwAccel: metadata.hwAccel,
      hwDevice: metadata.hwDevice,
      bufferSize: metadata.bufferSize,
    }
  },

  decodeFrame(id: number): { pts: number; width: number; height: number } | null {
    const instance = decoderInstances.get(id)
    if (!instance) throw new Error(`Decoder ${id} not found`)
    if (!instance.frameBuffer) throw new Error('Buffer not initialized')

    const frameInfo = instance.decoder.decodeFrame()
    if (!frameInfo) {
      return null
    }

    return {
      pts: frameInfo.pts,
      width: frameInfo.width,
      height: frameInfo.height,
    }
  },

  seek(id: number, timestamp: number): boolean {
    const instance = decoderInstances.get(id)
    if (!instance) throw new Error(`Decoder ${id} not found`)
    return instance.decoder.native.seek(timestamp)
  },

  close(id: number): void {
    const instance = decoderInstances.get(id)
    if (instance) {
      instance.decoder.close()
      decoderInstances.delete(id)
    }
  },

  getHwAccelInfo(id: number) {
    const instance = decoderInstances.get(id)
    if (!instance) throw new Error(`Decoder ${id} not found`)
    return instance.decoder.native.getHwAccelInfo()
  },
}

const api = {
  showFilePath(file: File) {
    const path = webUtils.getPathForFile(file)
    return path
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('platform', process.platform)
    contextBridge.exposeInMainWorld('decoder', decoderAPI)
  } catch (error) {
    console.error(error)
  }
}