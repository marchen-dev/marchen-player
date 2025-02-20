export interface CommentsModel {
  count: number
  comments: CommentModel[]
}

export interface CommentModel {
  cid: number
  m: string
  p: string
}
