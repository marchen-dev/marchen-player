/**
 * Mock 工厂：为单元测试提供 Port 接口的 mock 实现
 */

import type {
  DanmakuAPI,
  DanmakuCache,
  DanmakuEntry,
  HistoryStore,
  MatchResult,
  PlayerBridge,
  ServiceDeps,
  SettingsReader,
  VideoImporter,
  VideoInfo,
} from '../../src/types'
import { vi } from 'vitest'

/** 创建默认的视频信息 */
export function createMockVideoInfo(overrides?: Partial<VideoInfo>): VideoInfo {
  return {
    url: 'marchen://test/video.mkv',
    hash: 'abc123hash',
    size: 1024000,
    name: 'test-video.mkv',
    playList: [],
    ...overrides,
  }
}

/** 创建精准匹配结果 */
export function createMatchedResult(): MatchResult {
  return {
    isMatched: true,
    matches: [
      {
        episodeId: 1001,
        animeTitle: '测试动漫',
        episodeTitle: '第1话',
        animeId: 100,
      },
    ],
  }
}

/** 创建未匹配结果 */
export function createUnmatchedResult(): MatchResult {
  return {
    isMatched: false,
    matches: [
      { episodeId: 1001, animeTitle: '候选A', episodeTitle: '第1话', animeId: 100 },
      { episodeId: 1002, animeTitle: '候选B', episodeTitle: '第1话', animeId: 101 },
    ],
  }
}

/** 创建弹幕数据 */
export function createMockDanmakuEntries(): DanmakuEntry[] {
  return [
    {
      type: 'auto',
      source: 'dandanplay',
      selected: true,
      content: {
        count: 3,
        comments: [
          { cid: 1, m: '弹幕1', p: '1.00,1,16777215,user1' },
          { cid: 2, m: '弹幕2', p: '5.00,1,16777215,user2' },
          { cid: 3, m: '弹幕3', p: '10.00,4,255,user3' },
        ],
      },
    },
  ]
}

/** 创建 mock DanmakuAPI */
export function createMockAPI(overrides?: Partial<DanmakuAPI>): DanmakuAPI {
  return {
    match: vi.fn().mockResolvedValue(createMatchedResult()),
    getDanmu: vi.fn().mockResolvedValue({
      count: 3,
      comments: [
        { cid: 1, m: '弹幕1', p: '1.00,1,16777215,user1' },
        { cid: 2, m: '弹幕2', p: '5.00,1,16777215,user2' },
        { cid: 3, m: '弹幕3', p: '10.00,4,255,user3' },
      ],
    }),
    ...overrides,
  }
}

/** 创建 mock DanmakuCache */
export function createMockCache(overrides?: Partial<DanmakuCache>): DanmakuCache {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    isStale: vi.fn().mockResolvedValue(false),
    ...overrides,
  }
}

/** 创建 mock VideoImporter */
export function createMockImporter(overrides?: Partial<VideoImporter>): VideoImporter {
  return {
    importFromFile: vi.fn().mockResolvedValue(createMockVideoInfo()),
    importFromPath: vi.fn().mockResolvedValue(createMockVideoInfo()),
    ...overrides,
  }
}

/** 创建 mock HistoryStore */
export function createMockHistory(overrides?: Partial<HistoryStore>): HistoryStore {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

/** 创建 mock PlayerBridge */
export function createMockPlayerBridge(overrides?: Partial<PlayerBridge>): PlayerBridge {
  return {
    updateDanmaku: vi.fn(),
    ...overrides,
  }
}

/** 创建 mock SettingsReader */
export function createMockSettings(overrides?: Partial<SettingsReader>): SettingsReader {
  return {
    getChConvert: vi.fn().mockReturnValue(0),
    ...overrides,
  }
}

/** 创建完整的 mock ServiceDeps */
export function createMockDeps(overrides?: Partial<ServiceDeps>): ServiceDeps {
  return {
    api: createMockAPI(overrides?.api as any),
    cache: createMockCache(overrides?.cache as any),
    importer: createMockImporter(overrides?.importer as any),
    history: createMockHistory(overrides?.history as any),
    settings: createMockSettings(overrides?.settings as any),
  }
}
