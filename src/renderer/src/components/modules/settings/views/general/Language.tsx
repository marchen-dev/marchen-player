import type { SelectOption } from '@renderer/components/modules/shared/setting/SettingSelect'
import {
  APP_LANGUAGES,
  LANGUAGE_NATIVE_NAMES,
  PSEUDO_LANGUAGE,
  SYSTEM_PREFERENCE,
} from '@marchen/i18n'
import { SettingSelect } from '@renderer/components/modules/shared/setting/SettingSelect'
import { useLanguagePreference } from '@renderer/hooks/language'
import { LANGUAGE_SWITCH_ENABLED, PSEUDO_ENABLED } from '@renderer/lib/i18n'
import { useTranslation } from 'react-i18next'

import { SettingsRow } from '../../components'

/**
 * 「语言」设置行。各语言显示它们的自称名（不随界面语言变化），
 * 这样看不懂当前界面语言的用户也能找到自己的语言。
 * 界面多语言放开之前（见 @marchen/i18n 的发布开关）正式构建不渲染这一行。
 */
export const LanguageSetting = () => {
  const { t } = useTranslation('settings')
  const { preference, change } = useLanguagePreference()
  if (!LANGUAGE_SWITCH_ENABLED) return null

  const options: SelectOption[] = [
    { value: SYSTEM_PREFERENCE, label: t('general.appearance.language.system') },
    ...APP_LANGUAGES.map((language) => ({
      value: language,
      label: LANGUAGE_NATIVE_NAMES[language],
    })),
    // 伪本地化只在开发态提供，用来找未迁移的文字与布局溢出
    ...(PSEUDO_ENABLED
      ? [{ value: PSEUDO_LANGUAGE, label: LANGUAGE_NATIVE_NAMES[PSEUDO_LANGUAGE] }]
      : []),
  ]
  // 保存的偏好在当前环境不可选（例如开发态选过伪本地化）时显示为跟随系统，与实际生效的一致
  const value = options.some((option) => option.value === preference)
    ? preference
    : SYSTEM_PREFERENCE

  return (
    <SettingsRow
      // 地球图标与语言无关：看不懂当前界面语言的用户也能认出这一行是切换语言的
      label={
        // 用块级的 flex：行内的 inline-flex 会按基线对齐把这一行撑高 2px，下面的内容整体下移
        <span className="flex items-center gap-1.5">
          <i className="icon-[mingcute--earth-2-line] text-muted-foreground" aria-hidden />
          {t('general.appearance.language.label')}
        </span>
      }
      description={t('general.appearance.language.description')}
      labelId="language-preference-label"
      descriptionId="language-preference-description"
    >
      <SettingSelect
        ariaLabel={t('general.appearance.language.label')}
        groups={options}
        value={value}
        onValueChange={change}
      />
    </SettingsRow>
  )
}
