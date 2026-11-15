export default {
  generic: {
    unknown: 'Something went wrong',
    openVideo: "Couldn't open the video",
    withDetail: '{{summary}}: {{detail}}',
  },
  translation: {
    assets_network: 'Download failed. Check your network',
    assets_http: 'Download failed. The resources are temporarily unavailable',
    assets_integrity: 'The downloaded file failed verification',
    assets_storage: "Couldn't save. The disk may be full",
    assets_aborted: 'Download cancelled',
  },
  danmakuLink: {
    duplicate: 'This source has already been added',
    invalid_url: 'Enter a valid video page link',
    unsupported_url: "This video link isn't supported yet",
    network: 'The network request failed. Please try again later',
    http: 'The danmaku service returned HTTP {{status}}. Please try again later',
    unavailable:
      "Couldn't read the video information. The video may be unavailable or the request was restricted",
    danmaku_closed: 'Danmaku are turned off for this video',
    empty: 'This link has no danmaku that can be imported',
    not_found: "Couldn't find the specified episode",
    too_large: 'The danmaku exceed the count or size limit',
    busy: 'Another danmaku import is in progress. Please try again later',
    cancelled: 'The import was cancelled or timed out',
  },
  downloads: {
    invalid_link: 'Enter a direct HTTP/HTTPS file link or a BT v1 magnet link',
    exists: 'This download already exists',
    limit: 'The download limit has been reached',
    invalid_torrent: "The torrent file is invalid or isn't supported",
    unsupported_torrent: 'Only BT v1 is supported for now, not v2 or hybrid torrents',
    name_conflict: '“{{name}}” already exists in the save folder. Choose another folder',
    no_files_selected: 'Choose the files to download first',
    file_missing: 'The downloaded file was moved or modified',
    not_finished: "The file hasn't finished downloading",
    in_use: 'The file is in use. Stop playback first',
    engine: 'The download engine ran into a problem. Please try again',
    transfer_failed:
      'The download failed. Check the folder, free space and network, then try again',
    timeout: 'The connection timed out. Please try again',
    cancelled: 'Cancelled',
    expired: 'The pending download expired. Add it again',
    http_start:
      "The HTTP download couldn't start. Check the link and the save folder, then try again",
    interrupted_resumable: 'The download was interrupted. Click Retry to continue',
    interrupted_restart: 'The download was interrupted. Retrying will start over',
    incomplete: "The download didn't finish. Retrying will try to resume",
    save_failed:
      "The download finished but the file couldn't be saved. Check the destination folder",
    persist_failed:
      "The download records couldn't be saved, so transfers have stopped. Check the disk and restart the app",
    storage_corrupt:
      'The download records are damaged or from an incompatible version. The original file was kept; restore it from a backup',
    desktop_only: 'Downloads are only available in the desktop app',
  },
  remoteMedia: {
    access: "The video link can't be reached. Check the address or try another link",
    range: "This source doesn't support reading on demand. Use a different direct video link",
    changed: 'The video has changed. Open it again',
    unsupported:
      "Enter a direct HTTP/HTTPS link to a video file, without a username or password. Playlists aren't supported",
  },
  localDanmaku: {
    duplicate: 'This source has already been added',
    invalid_format:
      "The danmaku format isn't recognized. Choose a Bilibili-format XML or JSON file",
    empty: 'The file has no danmaku to import',
    read_failed: "Couldn't read the danmaku file. Please try again",
    save_failed: "Couldn't save the danmaku. Check the available storage and try again",
  },
  videoImport: {
    file_moved: "The video file may have been moved, so playback can't continue",
    info_failed: "Couldn't read the video information",
  },
  update: {
    save_timeout: 'Saving playback progress timed out. Please try again',
    save_request_failed: "The save request couldn't be sent",
    save_failed: "Couldn't save playback progress. Please try again",
  },
  subtitle: {
    not_downloaded: "The subtitle file hasn't finished downloading",
    unsupported_format: "The subtitle file format isn't supported",
    too_large: 'The subtitle file is too large',
  },
  playback: {
    aborted: 'Media loading was cancelled',
    network: 'The network connection failed while reading the media',
    decode: "This environment can't decode the media",
    'not-supported': "This environment doesn't support the media's format or codec",
  },
  pgs: {
    backtrack_exceeded:
      'The subtitle dependency chain is too long, so nothing is shown at this position for now',
  },
  mediaSource: {
    auth_failed: 'Wrong username or password, or the sign-in has expired',
    forbidden: "This account doesn't have access",
    unreachable: "Couldn't connect to the server. Check the address and your network",
    certificate:
      "The server certificate isn't trusted. Self-signed certificates aren't supported yet",
    unsupported_version: 'The server version is too old. Upgrade it and try again',
    range_unsupported: "This source doesn't support reading on demand, so it can't be played",
    not_found: "The content doesn't exist or was moved",
    content_changed: 'The video content has changed',
    source_removed: 'The media source was removed',
    invalid_input: 'The information entered is invalid',
    invalid_response: "The server returned something that couldn't be recognized",
  },
} as const
