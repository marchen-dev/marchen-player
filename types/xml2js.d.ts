/** 外部 XML 解析结果必须经过业务层 unknown 校验。 */
declare module 'xml2js' {
  export function parseStringPromise(
    xml: string,
    options?: { explicitArray?: boolean; strict?: boolean },
  ): Promise<unknown>
}
