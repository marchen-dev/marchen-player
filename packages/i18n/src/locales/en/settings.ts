export default {
  dialog: {
    title: 'Settings',
    description: 'Manage Marchen preferences, experimental features, and version information',
    navigationLabel: 'Settings categories',
    close: 'Close settings',
  },
  tabs: {
    general: { label: 'General', description: 'Manage app behavior, appearance, and local data' },
    downloads: { label: 'Downloads', description: 'Manage the download folder and transfers' },
    labs: { label: 'Labs', description: 'Try features that are still in development' },
    about: { label: 'About', description: 'Version, updates, and feedback' },
  },
  general: {
    app: {
      title: 'App',
      launchAtLogin: {
        label: 'Launch at login',
        description: 'Start Marchen automatically when you log in',
      },
    },
    appearance: {
      title: 'Appearance',
      theme: {
        label: 'Theme',
        description: 'Follow the system, or always use the light or dark appearance',
        ariaLabel: 'Theme preference',
        options: { system: 'System', light: 'Light', dark: 'Dark' },
      },
      language: {
        label: 'Language',
        description: 'The language used for the interface',
        system: 'System',
      },
    },
    playback: {
      title: 'Playback',
      playFirst: {
        label: 'Start playback first',
        description:
          'Play the video right away and add danmaku once it has loaded in the background; the beginning may have no danmaku',
      },
    },
    network: {
      title: 'Network',
      apiRoute: {
        label: 'API route',
        current: 'Current route: {{route}}',
        currentAuto: 'Current route: {{route}} (selected automatically)',
        // 下拉框宽度固定，「Auto (recommended)」放不下会被截断
        auto: 'Automatic',
      },
    },
    data: {
      title: 'Data',
      calculating: 'Calculating…',
      size: 'About {{size}}',
      items: {
        danmaku: {
          label: 'Danmaku cache',
          description: 'Fetched again on next playback; imported danmaku is kept',
          cleared: 'Danmaku cache cleared',
          failed: "Couldn't clear the danmaku cache",
        },
        thumbnail: {
          label: 'Playback thumbnails',
          description: 'Continue watching will show posters instead',
          cleared: 'Playback thumbnails cleared',
          failed: "Couldn't clear playback thumbnails",
        },
        network: {
          label: 'Network cache',
          description: 'Posters and other images; downloaded again when needed',
          cleared: 'Network cache cleared',
          failed: "Couldn't clear the network cache",
        },
        translation: {
          label: 'Translation model',
          description:
            'The engine and model used for danmaku translation; clearing them turns translation off',
          cleared: 'Translation model cleared',
          failed: "Couldn't clear the translation model",
        },
      },
      reset: {
        label: 'Reset app',
        description: 'Clears tasks, history, and settings; video files are kept',
        confirm: "Reset the app? This can't be undone.",
      },
    },
  },
  playerEngine: {
    label: 'Playback engine',
    options: { auto: 'Auto', native: 'Native (HTML5)', compat: 'Compatibility' },
    status: {
      switching: 'Switching engine…',
      preparing: 'Preparing playback…',
      current: 'In use: {{engine}}',
      pending: 'Applies the next time you open a video. Auto prefers native playback.',
    },
  },
  labs: {
    description:
      'Try features that are still in development. They may be unstable or change at any time',
    empty: 'No experimental features available',
    playback: {
      title: 'Playback',
      description: 'If you run into problems, send feedback from About',
    },
    remoteUrl: {
      label: 'Play from URL',
      description:
        'Shows “Play from URL” on the home page for opening direct HTTP/HTTPS video links. The source must support Range requests',
      descriptionWebSuffix: '; on the web, the source must also allow cross-origin access',
    },
  },
  about: {
    description: 'Marchen version, updates, and feedback',
    currentVersion: 'Version {{version}}',
    checkUpdate: 'Check for updates',
    checking: 'Checking…',
    update: {
      title: 'Software update',
      descriptionManual:
        'New versions are checked automatically. This is a system package: download the new package and install it over the current one.',
      descriptionInApp:
        'New versions are checked automatically. You decide when to download and install.',
      phase: {
        idle: 'Not checked yet',
        checking: 'Checking for updates…',
        upToDate: "You're up to date",
        available: 'New version available',
        downloading: 'Downloading update',
        preparing: 'Verifying and preparing the update…',
        ready: 'The new version is ready',
        installing: 'Saving progress and installing…',
        error: 'Update failed',
      },
      download: 'Download update',
      install: 'Install and restart',
      openDownloadPage: 'Open download page',
      progressLabel: 'Update download progress',
      estimating: 'Estimating',
      etaSeconds_one: 'About {{count}} second',
      etaSeconds_other: 'About {{count}} seconds',
      etaMinutes_one: 'About {{count}} minute',
      etaMinutes_other: 'About {{count}} minutes',
    },
    feedback: {
      title: 'Feedback',
      description: 'Report problems, share suggestions, or join the discussion',
      diagnostic: {
        label: 'Send diagnostic feedback',
        description:
          'Includes local logs to help diagnose playback, subtitle, or download problems',
        action: 'Send feedback…',
      },
      logs: {
        label: 'Log location',
        description: 'Local diagnostic logs, up to about 15 MB',
        action: 'Open folder',
      },
    },
  },
} as const
