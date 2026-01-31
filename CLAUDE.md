# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Marchen Player is a local anime video player with danmaku (bullet comments) support. It automatically matches danmaku to imported anime videos. Built with Electron, supporting Web, macOS, Windows, and Linux platforms.

## Development Commands

```bash
# Install dependencies (requires pnpm)
corepack enable
pnpm install

# Development
pnpm dev              # Start Electron dev server
pnpm dev:web          # Start web-only dev server

# Building
pnpm build            # Full build with typecheck
pnpm build:mac        # Build macOS (dmg + zip)
pnpm build:win        # Build Windows installer
pnpm build:linux      # Build Linux AppImage
pnpm build:web        # Build web version

# Code quality
pnpm typecheck        # Run TypeScript type checking
pnpm lint             # Run ESLint
pnpm lint:fix         # Auto-fix ESLint issues
pnpm format           # Format with Prettier

# Version management
pnpm bump             # Bump version (uses nbump)
```

## Architecture

### Process Structure (Electron)

- **Main Process** (`src/main/`): Node.js backend - window management, file system access, FFmpeg operations
- **Preload** (`src/preload/`): Context bridge exposing `electron`, `api`, and `platform` to renderer
- **Renderer** (`src/renderer/`): React frontend application

### IPC Communication

Uses `@egoist/tipc` for type-safe IPC between main and renderer processes:

- **Main handlers**: `src/main/tipc/` - Define routes (app, player, setting, utils)
- **Renderer client**: `src/renderer/src/lib/client.ts` - `tipcClient` for invoking main process, `handlers` for receiving events
- Routes are combined in `src/main/tipc/index.ts` and exported as `Router` type

Example usage in renderer:
```typescript
import { tipcClient } from '@renderer/lib/client'
const result = await tipcClient?.getAnimeDetailByPath({ path })
```

### State Management

- **Jotai atoms** (`src/renderer/src/atoms/`): Global state for player, progress, window, and settings
- **TanStack Query**: Server state and API data caching
- **Dexie** (`src/renderer/src/database/`): IndexedDB wrapper for local persistence (history)

### Routing

Hash-based routing with React Router v7. Routes defined in `src/renderer/src/router/router.tsx`. Main pages: Player, History.

### Path Aliases

Configured in `electron.vite.config.ts`:
- `@main` → `src/main`
- `@renderer` → `src/renderer/src`
- `@pkg` → `package.json`

### Custom Protocol

Uses `marchen://` protocol for local file access. Files are referenced with `MARCHEN_PROTOCOL_PREFIX` + absolute path.

## Key Dependencies

- **Video**: `@suemor/xgplayer` (custom xgplayer fork), `danmu.js`
- **Subtitles**: `@jellyfin/libass-wasm` (ASS/SSA rendering)
- **Media processing**: `fluent-ffmpeg` with `@ffmpeg-installer/ffmpeg`
- **UI**: Tailwind CSS, shadcn/ui (Radix), DaisyUI, Framer Motion
- **Icons**: Lucide React, Iconify (mingcute)

## Code Style

- ESLint config: `eslint-config-hyoban`
- Prettier: No semicolons, single quotes, 100 char width
- Pre-commit hook runs lint-staged on all staged files
