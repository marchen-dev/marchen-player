import type { Converter } from 'opencc-js/core'
import { ConverterFactory } from 'opencc-js/core'
import type { LocaleOption } from 'opencc-js/preset'
import * as Locale from 'opencc-js/preset'

/**
 * A utility class for converting between Traditional and Simplified Chinese.
 */
class ChineseConverter {
  private converter: Converter

  /**
   * Creates a converter instance for Chinese text.
   * @param from - Source locale (default: tw Traditional).
   * @param to - Target locale (default: Mainland Simplified).
   */
  constructor(from: LocaleOption = Locale.from.tw, to: LocaleOption = Locale.to.cn) {
    this.converter = ConverterFactory(from, to)
  }

  /**
   * Converts the stored text based on the specified locales.
   * @param text - The input text to convert.
   * @returns The converted text.
   */
  public convert(text: string): string {
    return this.converter(text)
  }

  /**
   * Static method to quickly convert tw Traditional Chinese to Mainland Simplified Chinese.
   * @param text - The text to convert.
   * @returns The converted text.
   */
  public static chtToChs(text: string): string {
    const converter = ConverterFactory(Locale.to.tw, Locale.to.cn)
    return converter(text)
  }
}

export const chineseConverter = new ChineseConverter()

export function createChineseConverter(from: LocaleOption, to: LocaleOption): ChineseConverter {
  return new ChineseConverter(from, to)
}
