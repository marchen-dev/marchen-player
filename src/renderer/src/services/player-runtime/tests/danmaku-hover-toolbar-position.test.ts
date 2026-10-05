import { describe, expect, it } from 'vitest'

import { computeHoverToolbarPosition } from '../danmaku/hover-toolbar-position'

const container = { width: 1000, height: 500 }
const toolbar = { width: 80, height: 46 }
const position = (
  node: { left: number; right: number; top?: number; bottom?: number },
  cursorX: number,
) =>
  computeHoverToolbarPosition({
    node: { top: 100, bottom: 136, ...node },
    cursorX,
    toolbar,
    container,
    overlap: 2,
    arrowInset: 14,
  })

describe('弹幕悬停工具条定位', () => {
  it('出现在文字正下方，以鼠标位置水平居中，箭头指向鼠标', () => {
    expect(position({ left: 200, right: 600 }, 350)).toEqual({
      left: 310,
      top: 134,
      placement: 'below',
      arrowLeft: 40,
    })
  })

  it('跟随鼠标而不是文字：同一条弹幕上不同位置悬停，工具条位置不同', () => {
    expect(position({ left: 200, right: 600 }, 250).left).toBe(210)
    expect(position({ left: 200, right: 600 }, 550).left).toBe(510)
  })

  it('鼠标已滑出文字时，锚点收回到文字的可见范围内', () => {
    expect(position({ left: 200, right: 300 }, 420)).toMatchObject({ left: 260, arrowLeft: 40 })
    expect(position({ left: 200, right: 300 }, 100)).toMatchObject({ left: 160, arrowLeft: 40 })
  })

  it('靠近画面左右边缘时工具条夹在画面内，箭头仍指向鼠标', () => {
    expect(position({ left: -300, right: 120 }, 20)).toMatchObject({ left: 0, arrowLeft: 20 })
    expect(position({ left: 700, right: 1200 }, 985)).toMatchObject({ left: 920, arrowLeft: 65 })
  })

  it('箭头不会落到工具条的圆角上', () => {
    expect(position({ left: -300, right: 120 }, 3).arrowLeft).toBe(14)
    expect(position({ left: 700, right: 1200 }, 999).arrowLeft).toBe(66)
  })

  it('下方放不下时翻到文字上方', () => {
    expect(position({ left: 200, right: 600, top: 440, bottom: 476 }, 350)).toMatchObject({
      top: 396,
      placement: 'above',
    })
  })

  it('上下都放不下时留在下方并夹进画面', () => {
    const result = computeHoverToolbarPosition({
      node: { left: 0, right: 200, top: 10, bottom: 46 },
      cursorX: 100,
      toolbar,
      container: { width: 1000, height: 70 },
      overlap: 2,
      arrowInset: 14,
    })
    expect(result).toMatchObject({ top: 24, placement: 'below' })
  })

  it('容器比工具条还窄时不产生负坐标', () => {
    expect(
      computeHoverToolbarPosition({
        node: { left: 0, right: 30, top: 0, bottom: 20 },
        cursorX: 10,
        toolbar,
        container: { width: 40, height: 20 },
        overlap: 2,
        arrowInset: 14,
      }),
    ).toMatchObject({ left: 0, top: 0 })
  })
})
