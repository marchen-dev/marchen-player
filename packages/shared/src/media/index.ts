export { isVideoFile, VIDEO_EXTENSIONS, VIDEO_FILE_ACCEPT } from './formats'

export type {
  DurableMediaIdentity,
  DurableMediaSource,
  ElectronDurableMediaSource,
  PersistentMediaSource,
  ProviderMediaSource,
  RemoteMediaSource,
  SerializableDurableMediaSource,
  WebDurableMediaSource,
} from './source'

export { isRemoteKind, PROVIDER_HISTORY_PREFIX, providerHistoryKey } from './source'
