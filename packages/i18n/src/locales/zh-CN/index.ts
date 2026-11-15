import common from './common'
import main from './main'
import settings from './settings'

/** 简体中文是源语言：键的类型由这里推导，其他语言缺失时回退到这里 */
export default { common, main, settings } as const
