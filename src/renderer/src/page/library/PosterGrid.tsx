import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'
import type { LibraryCardActions } from './LibraryCardContextMenu'
import type { LibrarySource } from './selectors'

import { PosterCard } from './PosterCard'

interface PosterGridProps {
  title: string
  sub?: string
  items: DB_Library[]
  onCardClick: (item: DB_Library) => void
  cardActions: LibraryCardActions
  /** animeId → 媒体来源，统计完成前为 undefined */
  sources?: Map<number, LibrarySource>
}

export const PosterGrid: FC<PosterGridProps> = ({
  title,
  sub,
  items,
  onCardClick,
  cardActions,
  sources,
}) => {
  return (
    <section className="library-rail">
      <div className="library-rail-head">
        <h2 className="library-rail-title">{title}</h2>
        {sub && <span className="library-rail-count">{sub}</span>}
      </div>
      <div className="library-poster-grid">
        {items.map((item) => (
          <PosterCard
            key={item.animeId}
            item={item}
            onClick={() => onCardClick(item)}
            actions={cardActions}
            source={sources?.get(item.animeId)}
          />
        ))}
      </div>
    </section>
  )
}
