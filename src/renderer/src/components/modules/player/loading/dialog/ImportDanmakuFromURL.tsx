import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { useToast } from '@renderer/components/ui/toast'
import type { DB_Danmaku } from '@renderer/database/schemas/history'
import { apiClient } from '@renderer/request'
import { useMutation } from '@tanstack/react-query'
import type { FC, FormEvent } from 'react'
import { memo, useCallback, useRef } from 'react'
import { z } from 'zod'


interface ImportDanmakuFromURLProps {
  onSelected: (params: { danmaku: DB_Danmaku[] }) => void
}

export const ImportDanmakuFromURL: FC<ImportDanmakuFromURLProps> = memo(({ onSelected }) => {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { mutate, isPending } = useMutation({
    mutationFn: async (url: string) => {
      const matchedDanmaku = await apiClient.comment.getExtcomment({ url })
      if (!matchedDanmaku?.count) {
        toast({ title: '没有找到弹幕' })
        return
      }
      const _damaku = [
        { type: 'third-party-manual', selected: true, source: url, content: matchedDanmaku },
      ] satisfies DB_Danmaku[]

      onSelected &&
        onSelected({
          danmaku: _damaku,
        })

      toast({ title: '添加成功' })
    },
    onError: (error) => {
      toast({ title: error.message })
    },
  })

  const handleOnSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const inputValue = inputRef.current?.value
      if (!inputValue) {
        toast({ title: '请输入第三方网址' })
        return
      }

      const isEmail = z.string().url().safeParse(inputValue)
      if (!isEmail.success) {
        toast({ title: '请输入正确的网址' })
        return
      }
      mutate(inputValue)
      clearInput()
    },
    [mutate],
  )
  const clearInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }, [])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button onClick={() => {}} variant="secondary">
          <i className="icon-[mingcute--web-line] mr-1 text-lg" />
          <span>从第三方网址导入</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <form className="w-full" onSubmit={handleOnSubmit}>
          <Input
            id="width"
            disabled={isPending}
            ref={inputRef}
            placeholder="https:// 按回车完成输入"
          />
        </form>
      </PopoverContent>
    </Popover>
  )
})
