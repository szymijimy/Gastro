/** Ogłoszenie opublikowane przez managera w lokalu. */
export type Announcement = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  visible_from: string | null
  visible_until: string | null
  created_at: string
}
