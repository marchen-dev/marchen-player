import type { ReponseBaseModel } from './base'

export interface CommentsModel extends ReponseBaseModel {
  count: number
  comments: CommentModel[]
}

export interface CommentModel {
  cid: number
  m: string
  p: string
}
