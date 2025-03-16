import fs from 'node:fs'
import path from 'node:path'

import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import ffprobePath from '@ffprobe-installer/ffprobe'
import { createStorageFolder, screenshotsPath, subtitlesPath } from '@main/constants/app'
import ffmpeg from 'fluent-ffmpeg'

ffmpeg.setFfmpegPath(ffmpegPath.path.replace('app.asar', 'app.asar.unpacked'))
ffmpeg.setFfprobePath(ffprobePath.path.replace('app.asar', 'app.asar.unpacked'))

export default class FFmpeg {
  ffmpeg: ffmpeg.FfmpegCommand

  constructor(inputPath: string) {
    createStorageFolder()
    this.ffmpeg = ffmpeg(inputPath)
  }

  grabFrame = (time: string): Promise<string> => {
    const fileName = `${Date.now()}.jpeg`
    const fullPath = path.join(screenshotsPath(), fileName)
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(screenshotsPath())) {
        fs.mkdirSync(screenshotsPath(), { recursive: true })
      }
      this.ffmpeg
        .screenshots({
          timestamps: [time],
          filename: fileName,
          folder: screenshotsPath(),
          size: '640x360', // 可根据需要调整尺寸
        })
        .on('end', () => {
          try {
            const data = fs.readFileSync(fullPath)
            const base64Image = `data:image/jpeg;base64,${data.toString('base64')}`
            fs.unlinkSync(fullPath)
            resolve(base64Image)
          } catch (error) {
            reject(error)
          }
        })
        .on('error', (err) => {
          reject(err?.message)
        })
    })
  }

  coverToAssSubtitle = (): Promise<{ fileName: string; filePath: string }> => {
    const fileName = `${Date.now()}.ass`
    const outPutPath = path.join(subtitlesPath(), fileName)
    return new Promise((resolve, reject) => {
      this.ffmpeg
        .outputOptions('-c:s ass')
        .save(outPutPath)
        .on('end', () => {
          resolve({ filePath: outPutPath, fileName })
        })
        .on('error', (err) => {
          reject(err)
        })
    })
  }

  getSubtitlesIntroFromAnime = (): Promise<ffmpeg.FfprobeStream[]> => {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(this.ffmpeg._inputs[0].source, (err, metadata) => {
        if (err) {
          resolve([])
        }
        const subtitleStreams = metadata.streams.filter(
          (stream) => stream.codec_type === 'subtitle',
        )
        if (subtitleStreams.length === 0) {
          resolve([])
        }

        return resolve(subtitleStreams)
      })
    })
  }

  extractSubtitles = async (index: number): Promise<string> => {
    if (!fs.existsSync(subtitlesPath())) {
      fs.mkdirSync(subtitlesPath(), { recursive: true })
    }

    const fileName = `${Date.now()}-${index}.ass`
    const outputPath = path.join(subtitlesPath(), fileName)
    return new Promise<string>((resolve, reject) => {
      this.ffmpeg
        .clone() // Ensure a new instance for each command
        .outputOptions(['-map', `0:s:${index}`, '-c:s', 'ass'])
        .save(outputPath)
        .on('end', () => {
          resolve(outputPath)
        })
        .on('error', (err) => {
          reject(err)
        })
    })
  }
}
