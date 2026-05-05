import { bangumi } from './api/bangumi'
import { comment } from './api/comment'
import { match } from './api/match'
import { search } from './api/search'

export const apiClient = {
  match,
  comment,
  search,
  bangumi,
}
