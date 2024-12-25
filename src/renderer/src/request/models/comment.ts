export interface CommentsModel {
  count: number
  selected?: boolean
  comments: CommentModel[]
}

export interface CommentModel {
  cid: number
  m: string
  p: string
}

