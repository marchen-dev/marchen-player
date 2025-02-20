import type { SearchAnimeModel, SearchAnimeRequestModel } from '../models/search'
import { Get } from '../ofetch'

export enum Searchkeys {
  getSearchEpisodes = 'getSearchEpisodes',
}

function getSearchEpisodes(data: SearchAnimeRequestModel) {
  return Get<SearchAnimeModel>('search/episodes', data)
}

export const search = {
  getSearchEpisodes,
  Searchkeys,
}
