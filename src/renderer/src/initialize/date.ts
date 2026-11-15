import dayjs from 'dayjs'

import relativeTime from 'dayjs/plugin/relativeTime'
// 两种界面语言的语言包都引入；具体用哪一个由 initialize/i18n.ts 随界面语言切换
import 'dayjs/locale/en'
import 'dayjs/locale/zh-cn'

export const relativeTimeToNow = (date: Date | string): string => {
  return dayjs().to(dayjs(date))
}

export const initializeDayjs = () => {
  dayjs.extend(relativeTime)
  // 默认与界面的默认语言（简体中文）一致
  dayjs.locale('zh-cn')
}
