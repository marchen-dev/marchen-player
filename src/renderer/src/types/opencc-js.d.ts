// opencc-js 的 `./*` 子路径导出未附带类型，这里为按需引入的字典模块补充声明。
// 字典为「源 目标|源 目标」格式的序列化字符串。
declare module 'opencc-js/dict/*' {
  const dict: string
  export default dict
}
