export default {
  detail: {
    close: 'Close details',
    episodesTitle: 'Episodes',
    progress: 'Episode {{watched}} / {{total}}',
  },
  episodeCount_one: '{{count}} episode',
  episodeCount_other: '{{count}} episodes',
  empty: {
    title: 'Your library is empty',
    sub: 'Anime you play is added here automatically',
    noMatchTitle: 'No matches',
    noMatchSub: 'Try clearing the filters or the search',
  },
  episode: {
    watched: 'Watched',
    watchedPercent: '{{percent}}% watched',
    notStarted: 'Not started',
  },
  hero: {
    onAir: 'On Air',
    continueWatching: 'Continue Watching',
    details: 'Details',
    lastWatched: 'Last watched: episode {{episode}}',
  },
  card: {
    resume: 'Resume · Episode {{episode}}',
    episode: 'Episode {{episode}}',
    play: 'Play',
    upcoming: 'Coming up',
    onAir: 'On air',
    completed: 'Watched',
  },
  menu: {
    play: 'Play',
    playEpisode: 'Play · Episode {{episode}}',
    details: 'View details',
    resetProgress: 'Reset watch progress',
    markAllWatched: 'Mark all as watched',
    remove: 'Remove from library…',
  },
  rail: {
    continueWatching: 'Continue watching',
    all: 'All titles',
    scrollLeft: 'Scroll left',
    scrollRight: 'Scroll right',
  },
  source: {
    local: 'Local',
    remote: 'Remote',
    mixed: 'Local + remote',
  },
  cta: {
    start: 'Start watching',
    continue: 'Continue watching',
    continueEpisode: 'Continue · Episode {{episode}}',
  },
  removeConfirm:
    'Remove “{{title}}” from the library? The playback history is kept, and it will be added again the next time you play it.',
} as const
