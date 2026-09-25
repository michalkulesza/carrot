import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')

process.loadEnvFile(resolve(appDirectory, '.env'))

const platform = process.argv[2]

if (platform !== 'ios' && platform !== 'android') {
  console.error('Usage: node scripts/eas-build-local.mjs <ios|android>')
  process.exit(2)
}

if (platform === 'ios') {
  process.env.EXPO_PUBLIC_API_URL = 'https://app.carrot.xcxz.xyz'
}

const eas = spawnSync(
  'pnpm',
  ['exec', 'eas', 'build', '--platform', platform, '--local'],
  { cwd: appDirectory, env: process.env, stdio: 'inherit', shell: true },
)

if (eas.error) {
  console.error(eas.error)
  process.exit(1)
}

process.exit(eas.status ?? 1)
