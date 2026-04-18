import type { SliderProps } from '@radix-ui/react-slider'
import type { FC } from 'react'
import { Slider } from '@renderer/components/ui/slider'
import { cn } from '@renderer/lib/utils'
import { debounce } from 'lodash-es'
import { memo, useCallback, useState } from 'react'

interface SettingSliderProps extends SliderProps {
  onValueChangeWithDebounce?: (value: number[]) => void
  classNames?: {
    slider?: string
    span?: string
  }
}

export const SettingSlider: FC<SettingSliderProps> = memo((props) => {
  const [progress, setProgress] = useState(props.defaultValue)
  const { classNames, className, onValueChangeWithDebounce, ...rest } = props

  const handleOnValueChangeWithDebounce = useCallback(
    debounce((value: number[]) => {
      onValueChangeWithDebounce?.(value)
    }, 500),
    [props],
  )

  return (
    <div className="flex justify-end gap-2">
      <Slider
        onValueChange={(value) => {
          setProgress(value)
          handleOnValueChangeWithDebounce(value)
        }}
        {...rest}
        className={cn('w-[170px]', className, classNames?.slider)}
      />
      <span className={cn('w-5 font-medium', classNames?.span)}>{progress}s</span>
    </div>
  )
})
