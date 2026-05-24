import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC } from 'react'

import { PosterCard } from './PosterCard'

interface PosterGridProps {
  title: string
  sub?: string
  items: DB_Library[]
  onCardClick: (item: DB_Library) => void
}

export const PosterGrid: FC<PosterGridProps> = ({ title, sub, items, onCardClick }) => {
  return (
    <section className="library-rail">
      <div className="library-rail-head">
        <h2 className="library-rail-title">{title}</h2>
        {sub && <span className="library-rail-count">{sub}</span>}
      </div>
      <div className="library-poster-grid">
        {items.map((item) => (
          <PosterCard key={item.animeId} item={item} onClick={() => onCardClick(item)} />
        ))}
      </div>
    </section>
  )
}
