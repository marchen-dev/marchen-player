export default {
  routes: {
    player: 'Player',
    library: 'Library',
    mediaSources: 'Media Sources',
    downloads: 'Downloads',
  },
  sidebar: {
    settings: 'Settings',
  },
  logoAlt: 'Marchen app icon',
  errorPage: {
    title: 'Something went wrong 😭',
    messageLabel: 'Details:',
    reload: 'Reload page',
  },
  modalFallbackDescription: 'Dialog content',
  network: {
    offlineTitle: 'Network unavailable',
    offlineDescription: 'Check your network connection',
  },
  request: {
    forbidden: 'The request was refused. Please contact the developer - {{url}}',
    failed: 'Request failed',
  },
  update: {
    readyTitle: 'The new version is ready',
    readyDescription: 'See the update on the About page and choose when to install.',
    view: 'View update',
    updatedTitle: 'Updated to {{version}}',
    updatedDescription: "You're now running the new version.",
    viewNotes: "See what's new",
    viewNotesAlt: 'Open the release notes for this version in your browser',
    saveFailed: "Couldn't save playback progress. Please try again",
  },
  reset: {
    successTitle: 'Reset complete',
    successDescription: 'The page will reload in 3 seconds',
  },
  revealInFileManager: {
    mac: 'Show in Finder',
    windows: 'Show in File Explorer',
    other: 'Show in file manager',
  },
  storageNotice: {
    title: 'Playback storage updated',
    description:
      'This version uses a new playback history and library. Data from earlier versions is kept but not imported automatically.',
  },
  titlebar: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close window',
  },
  dropZone: {
    release: 'Drop to open the video',
  },
  desktopPromo: {
    title: 'Get the desktop app',
    subtitle: 'Free on macOS, Windows, and Linux. Compared with the web version, it adds:',
    advantages: {
      mediaSources: 'Connect to Jellyfin, Emby, and WebDAV to browse and play directly',
      remote: 'Play direct video links by URL, and download magnet and BT resources',
      local: 'Finds subtitles and the next episode in the same folder, and resumes from history',
    },
    later: 'Maybe later',
    download: 'Download',
  },
  mobileNotice: {
    title: 'Open on a computer',
    description:
      "Marchen Player is designed for desktop browsers and the desktop app. On a phone you can't drag in videos or use the player properly.",
    share: 'Share the link to a computer',
    continue: 'Continue anyway',
    copiedTitle: 'Link copied',
    copiedDescription: 'Open it in a browser on your computer',
  },
  feedback: {
    title: 'Send feedback',
    description: "Describe the problem and we'll look into it together with the diagnostics",
    messageLabel: 'What went wrong?',
    messagePlaceholder: "For example: an MKV video says it can't be decoded when opened…",
    contactLabel: 'Contact (optional)',
    contactPlaceholder: 'Email or Telegram',
    attachLogs: 'Attach diagnostic logs',
    attachLogsDescription: 'Includes the app version, system information, and recent activity',
    send: 'Send',
    sending: 'Sending…',
    sendAnyway: 'Send anyway',
    confirmRepeat: 'You just sent feedback. Send again?',
    success: 'Thanks, we received your feedback!',
    referenceLabel: 'Reference',
    referenceHint: 'Mention this reference on GitHub or by email to help us find the problem',
    referenceCopied: 'Reference copied',
    unavailable: "Feedback can't be sent online right now. You can reach us manually:",
    copyDiagnostics: 'Copy diagnostics',
    diagnosticsCopied: 'Diagnostics copied',
    openLogs: 'Open log folder',
    copyEmail: 'Copy email',
    emailCopied: 'Email copied',
    failed: {
      timeout: 'Sending timed out. Check your network and try again.',
      blocked:
        "Couldn't send. A browser extension may have blocked it. Try again or contact us manually.",
      other: "Couldn't send. Try again or contact us manually.",
    },
  },
} as const
