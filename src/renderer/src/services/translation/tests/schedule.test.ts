import type { TranslatableItem } from '../schedule'
import { describe, expect, it, vi } from 'vitest'
import {
  buildTranslationPlan,
  needsTranslation,
  pickNextBatch,
  translationKey,
  TranslationScheduler,
} from '../schedule'
import { TranslationStore } from '../translation-store'

const item = (id: string, time: number, text: string): TranslatableItem => ({ id, time, text })
const NONE: ReadonlySet<string> = new Set()

/** 假引擎：给每段文本加前缀，并记录每一批的输入 */
const createTranslate = () => {
  const batches: string[][] = []
  const translate = vi.fn(async (texts: string[]) => {
    batches.push(texts)
    return texts.map((text) => `EN(${text})`)
  })
  return { translate, batches }
}

/** 等待调度器把当前计划跑完 */
const settle = async () => {
  for (let index = 0; index < 50; index += 1) await Promise.resolve()
}

describe('需翻译判定与键', () => {
  it('含汉字且不含假名才翻译', () => {
    expect(needsTranslation('前方高能')).toBe(true)
    expect(needsTranslation('这个BGM一响我就知道要出事')).toBe(true)
    for (const text of [
      '233333',
      'awsl',
      'wwwww',
      '😂😂',
      '',
      '   ',
      'かわいい',
      '草生える',
      'カワイイ',
    ])
      expect(needsTranslation(text), text).toBe(false)
  })

  it('繁体与简体得到相同的键，并去掉首尾空白', () => {
    expect(translationKey('  這個畫面太好了 ')).toBe(translationKey('这个画面太好了'))
    expect(translationKey(' 草 ')).toBe('草')
  })
})

describe('翻译计划', () => {
  it('过滤非中文与被屏蔽的条目，相同文本合并计数', () => {
    const plan = buildTranslationPlan(
      [
        item('1', 5, '前方高能'),
        item('2', 1, '233333'),
        item('3', 9, '前方高能'),
        item('4', 3, '剧透警告'),
        item('5', 7, '泪目'),
        item('6', 2, '前方高能'),
      ],
      new Set(['4']),
    )
    expect(plan.itemCount).toBe(4)
    expect(plan.entries).toEqual([
      { key: '前方高能', time: 2, count: 3 },
      { key: '泪目', time: 7, count: 1 },
    ])
  })

  it('繁体弹幕与对应简体弹幕合并为一项', () => {
    const plan = buildTranslationPlan([item('1', 1, '這個畫面'), item('2', 2, '这个画面')], NONE)
    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].count).toBe(2)
  })
})

describe('取下一批', () => {
  const entries = [10, 20, 30, 40, 50].map((time) => ({ key: `k${time}`, time, count: 1 }))
  const pick = (now: number, size: number, done: string[] = []) =>
    pickNextBatch(entries, (key) => done.includes(key), now, size).map((entry) => entry.key)

  it('从播放位置之后最近的条目开始', () => {
    expect(pick(25, 2)).toEqual(['k30', 'k40'])
    expect(pick(30, 1)).toEqual(['k30'])
  })

  it('到片尾后回到片头补前面的', () => {
    expect(pick(45, 3)).toEqual(['k50', 'k10', 'k20'])
    expect(pick(999, 2)).toEqual(['k10', 'k20'])
  })

  it('跳过已完成的条目，全部完成时返回空', () => {
    expect(pick(0, 3, ['k10', 'k30'])).toEqual(['k20', 'k40', 'k50'])
    expect(
      pick(
        0,
        3,
        entries.map((entry) => entry.key),
      ),
    ).toEqual([])
  })
})

describe('调度器', () => {
  it('按播放位置优先翻译全部文本，并汇报进度与完成', async () => {
    const store = new TranslationStore()
    const { translate, batches } = createTranslate()
    const progress: Array<[number, number]> = []
    const onComplete = vi.fn()
    const scheduler = new TranslationScheduler({
      translate,
      store,
      now: () => 25,
      batchSize: 2,
      onProgress: ({ done, total }) => progress.push([done, total]),
      onComplete,
      clock: () => 0,
    })
    scheduler.setItems(
      [
        item('1', 10, '第一句'),
        item('2', 20, '第二句'),
        item('3', 30, '第三句'),
        item('4', 40, '第四句'),
        item('5', 41, '第四句'),
        item('6', 42, 'awsl'),
      ],
      NONE,
    )
    scheduler.start()
    await settle()

    expect(batches).toEqual([
      ['第三句', '第四句'],
      ['第一句', '第二句'],
    ])
    expect(store.get('第四句')).toBe('EN(第四句)')
    expect(progress.at(-1)).toEqual([5, 5])
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      items: 5,
      uniqueTexts: 4,
      translatedTexts: 4,
    })
  })

  it('重复文本只送入引擎一次', async () => {
    const store = new TranslationStore()
    const { translate, batches } = createTranslate()
    const scheduler = new TranslationScheduler({ translate, store, now: () => 0 })
    scheduler.setItems(
      Array.from({ length: 200 }, (_, index) => item(String(index), index, '前方高能')),
      NONE,
    )
    scheduler.start()
    await settle()
    expect(batches).toEqual([['前方高能']])
    expect(scheduler.progress).toEqual({ done: 200, total: 200 })
  })

  it('跳转后下一批从新位置取', async () => {
    const store = new TranslationStore()
    let now = 0
    const batches: string[][] = []
    const scheduler = new TranslationScheduler({
      store,
      now: () => now,
      batchSize: 1,
      translate: async (texts) => {
        batches.push(texts)
        // 第一批返回前用户跳到了 35 秒
        if (batches.length === 1) now = 35
        return texts.map((text) => `EN(${text})`)
      },
    })
    scheduler.setItems(
      [10, 20, 30, 40, 50].map((time) => item(String(time), time, `第${time}秒`)),
      NONE,
    )
    scheduler.start()
    await settle()
    expect(batches.map((batch) => batch[0])).toEqual([
      '第10秒',
      '第40秒',
      '第50秒',
      '第20秒',
      '第30秒',
    ])
  })

  it('换弹幕后复用已有译文，只翻译新文本', async () => {
    const store = new TranslationStore()
    const { translate, batches } = createTranslate()
    const onComplete = vi.fn()
    const scheduler = new TranslationScheduler({ translate, store, now: () => 0, onComplete })
    scheduler.setItems([item('1', 1, '旧的一句')], NONE)
    scheduler.start()
    await settle()

    scheduler.setItems([item('1', 1, '旧的一句'), item('2', 2, '新的一句')], NONE)
    await settle()

    expect(batches).toEqual([['旧的一句'], ['新的一句']])
    expect(scheduler.progress).toEqual({ done: 2, total: 2 })
    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(onComplete.mock.calls[1][0]).toMatchObject({
      items: 2,
      uniqueTexts: 2,
      translatedTexts: 1,
    })
  })

  it('解除屏蔽的条目补入队列', async () => {
    const store = new TranslationStore()
    const { translate, batches } = createTranslate()
    const scheduler = new TranslationScheduler({ translate, store, now: () => 0 })
    const items = [item('1', 1, '正常一句'), item('2', 2, '剧透警告')]
    scheduler.setItems(items, new Set(['2']))
    scheduler.start()
    await settle()
    expect(batches).toEqual([['正常一句']])

    scheduler.setItems(items, NONE)
    await settle()
    expect(batches).toEqual([['正常一句'], ['剧透警告']])
  })

  it('引擎返回空结果的文本按失败处理：不入表、不重试、计入进度', async () => {
    const store = new TranslationStore()
    const translate = vi.fn(async (texts: string[]) => texts.map(() => ''))
    const onComplete = vi.fn()
    const scheduler = new TranslationScheduler({ translate, store, now: () => 0, onComplete })
    scheduler.setItems([item('1', 1, '翻不出来')], NONE)
    scheduler.start()
    await settle()
    expect(translate).toHaveBeenCalledTimes(1)
    expect(store.get('翻不出来')).toBeUndefined()
    expect(scheduler.progress).toEqual({ done: 1, total: 1 })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('引擎出错时停止并通知，不再继续取批', async () => {
    const store = new TranslationStore()
    const failure = new Error('boom')
    const translate = vi.fn(async () => {
      throw failure
    })
    const onError = vi.fn()
    const scheduler = new TranslationScheduler({
      translate,
      store,
      now: () => 0,
      onError,
      batchSize: 1,
    })
    scheduler.setItems([item('1', 1, '第一句'), item('2', 2, '第二句')], NONE)
    scheduler.start()
    await settle()
    expect(translate).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(failure)
  })

  it('停止后不再取下一批，也不把停止当作引擎故障', async () => {
    const store = new TranslationStore()
    const onError = vi.fn()
    let release: (() => void) | undefined
    const translate = vi.fn(
      (texts: string[]) =>
        new Promise<string[]>((resolve) => {
          release = () => resolve(texts.map((text) => `EN(${text})`))
        }),
    )
    const scheduler = new TranslationScheduler({
      translate,
      store,
      now: () => 0,
      onError,
      batchSize: 1,
    })
    scheduler.setItems([item('1', 1, '第一句'), item('2', 2, '第二句')], NONE)
    scheduler.start()
    await settle()
    scheduler.stop()
    release?.()
    await settle()
    expect(translate).toHaveBeenCalledTimes(1)
    // 在途批次的译文仍然有效
    expect(store.get('第一句')).toBe('EN(第一句)')
    expect(onError).not.toHaveBeenCalled()
  })

  it('没有需要翻译的弹幕时不触发完成', async () => {
    const store = new TranslationStore()
    const { translate } = createTranslate()
    const onComplete = vi.fn()
    const scheduler = new TranslationScheduler({ translate, store, now: () => 0, onComplete })
    scheduler.setItems([item('1', 1, '233333')], NONE)
    scheduler.start()
    await settle()
    expect(translate).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('译文表', () => {
  it('写入后可读，并只在内容变化时通知', () => {
    const store = new TranslationStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.setMany([
      ['a', 'A'],
      ['b', 'B'],
    ])
    expect(store.get('a')).toBe('A')
    expect(listener).toHaveBeenCalledTimes(1)
    const version = store.version
    store.setMany([['a', 'A']])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.version).toBe(version)
  })

  it('空译文不入表', () => {
    const store = new TranslationStore()
    store.setMany([['a', '']])
    expect(store.get('a')).toBeUndefined()
    expect(store.size).toBe(0)
  })

  it('超过容量上限时整体清空再写入', () => {
    const store = new TranslationStore()
    store.setMany(Array.from({ length: 20_000 }, (_, index) => [`k${index}`, 'v'] as const))
    expect(store.size).toBe(20_000)
    store.setMany([['overflow', 'v']])
    expect(store.size).toBe(1)
    expect(store.get('overflow')).toBe('v')
  })
})
