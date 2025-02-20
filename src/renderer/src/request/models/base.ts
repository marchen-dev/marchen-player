export interface ReponseBaseModel {
  /**
   * 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中
   */
  errorCode?: number

  /**
   * 接口是否调用成功
   */
  success?: boolean

  /**
   * 当发生错误时，说明错误具体原因
   */
  errorMessage?: string
}
