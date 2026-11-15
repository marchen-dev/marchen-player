export default {
  menu: {
    about: 'About {{appName}}',
    checkForUpdates: 'Check for Updates…',
    feedback: 'Send Feedback…',
    settings: 'Settings…',
    services: 'Services',
    hide: 'Hide {{appName}}',
    hideOthers: 'Hide Others',
    clearData: 'Clear Data',
    quit: 'Quit {{appName}}',
    importAnime: 'Import Anime',
    close: 'Close',
  },
  dialog: {
    clearDataConfirm:
      'This will clear all app data, including history and settings. Do you want to continue?',
    clearDataOk: 'Clear',
    clearDataFailed: "Couldn't clear the data. Check disk space and permissions, then try again",
    downloadsQuitConfirm:
      'Some downloads are unfinished. They will stop when you quit and can be resumed the next time you open the app.',
    quit: 'Quit',
    downloadsSaveFailed:
      "The downloads couldn't be saved, so the app hasn't quit. Check the disk and try again.",
  },
  fileDialog: {
    video: 'Video files',
    subtitle: 'Subtitle files',
    torrent: 'BT torrents',
  },
  update: {
    installIncomplete: "The update hasn't been installed yet. Please try again",
    later: 'Later',
    retryInstall: 'Retry saving and install',
    closeBlocked: "Playback progress wasn't saved, so the window is still open",
    quitBlocked: "Playback progress wasn't saved, so the app hasn't quit",
    unavailable: "In-app updates aren't available right now",
    unavailableDetail: 'Download the new version manually from the release page.',
    openDownloadPage: 'Open download page',
    devMode: "Updates aren't checked in development mode",
    noNotes: 'No release notes',
  },
  downloads: {
    serviceName: 'Marchen Downloads',
    defaultName: 'download-{{id}}',
  },
  danmakuLink: {
    bilibiliSeason: 'Bilibili series',
    bilibiliEpisode: '{{season}} · Episode {{episode}} {{title}}',
  },
} as const
