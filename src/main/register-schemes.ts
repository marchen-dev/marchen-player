import { MARCHEN_PROTOCOL } from '@marchen/shared/constants/protocol'
import { protocol } from 'electron'

/** Electron 要求自定义 scheme 在 app ready 前同步声明，不能等待异步 instrumentation。 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: MARCHEN_PROTOCOL,
    privileges: {
      bypassCSP: true,
      stream: true,
      standard: true,
    },
  },
])
