import { jotaiStore } from '@renderer/atoms/store'
import { apiClient } from '@renderer/request'
import { useQuery } from '@tanstack/react-query'
import { atomWithReset } from 'jotai/utils'
import { debounce } from 'lodash-es'
import type { ChangeEvent } from 'react'
import { useCallback, useState } from 'react'

export const showMatchAnimeDialogAtom = atomWithReset<{ open: boolean; hash?: string }>({
  open: false,
})

export const showMatchAnimeDialog = (open: boolean, hash?: string) =>
  jotaiStore.set(showMatchAnimeDialogAtom, { open, hash })

export const useSearchAnime = () => {
  const [searchText, setSearchText] = useState('')
  const { data } = useQuery({
    queryKey: [apiClient.search.Searchkeys, searchText],
    queryFn: () => apiClient.search.getSearchEpisodes({ anime: searchText }),
    enabled: searchText.length > 1,
  })
  const handleSearchAnime = useCallback(
    // eslint-disable-next-line react-compiler/react-compiler
    debounce((event: ChangeEvent<HTMLInputElement>) => {
      setSearchText(event.target.value)
    }, 400),
    [],
  )

  return { handleSearchAnime, searchData: data }
}
