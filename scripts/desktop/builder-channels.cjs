const { version } = require('../../package.json')
const {
  parseReleaseVersion,
  sparkleBuildVersion,
} = require('../../packages/shared/src/update-policy.ts')
const { channel } = parseReleaseVersion(version)

// 所有 electron-builder 入口共用，避免本地构建和 CI 使用不同元数据文件名。
module.exports = {
  publish: { channel: channel === 'stable' ? 'latest' : channel },
  // Sparkle 使用 CFBundleVersion 比较；不能附加 CI run number 改变发行版本。
  mac: { bundleVersion: sparkleBuildVersion(version) },
  ...(process.env.MARCHEN_RELEASE_NOTES
    ? { releaseInfo: { releaseNotesFile: process.env.MARCHEN_RELEASE_NOTES } }
    : {}),
}
