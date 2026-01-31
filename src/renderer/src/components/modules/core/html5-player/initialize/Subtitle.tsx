import { isWeb } from '@renderer/lib/utils'
import { useEffect, useRef } from 'react'

import { usePlayerInstance } from '../Context'
import { useSubtitle } from '../setting/items/subtitle/hooks'

export const InitializeSubtitle = () => {
  const { initializeSubtitle, isFetching } = useSubtitle()
  const player = usePlayerInstance()
  const onceRef = useRef(false)
  useEffect(() => {
    if (isWeb) {
      return
    }
    if (!player || isFetching || onceRef.current) {
      return
    }

    onceRef.current = true
    initializeSubtitle()
  }, [player, isFetching])
  return null
}
