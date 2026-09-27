## 背景

为 Marchen Player 补齐基础 SEO 与链接分享信息。直接修改 Electron/Web 共用 HTML，文档标题使用 Marchen Player，canonical 和分享地址固定为 https://marchen-play.suemor.com/。增加可复现的 1200×630 品牌分享封面，仅 Web 非生产环境注入 noindex。保留极简播放器首页和 HashRouter，不新增介绍页、sitemap、结构化数据或业务功能。

## 1. 元信息与分享

- [x] 1.1 补齐共享 HTML 的语言、标题、描述、canonical、Open Graph 和 Twitter Card。
- [x] 1.2 制作并检查 1200×630 分享封面，保留生成源文件。
- [x] 1.3 按 Web 部署环境控制 noindex，不影响 Electron。

## 2. 验证

- [x] 2.1 检查类型、格式与 Web 构建产物，验证生产/预览索引差异及桌面共享入口，记录验证边界。

## 验证记录

- `pnpm typecheck`、本次 TS/JS 文件的 ESLint、Prettier 和 `git diff --check` 通过。
- 显式关闭 Sentry 上传后，`MARCHEN_DEPLOY_ENV=production pnpm build:web` 通过；构建仍提示大 chunk，未调整播放器分包。
- 检查实际 `out/web/index.html`：标题、分享地址正确且无 noindex；输出 PNG 与源文件一致，1200×630、38618 字节。
- 通过 Vite 实际 `transformIndexHtml` 分别验证 production / preview / 未声明环境：仅后两者生成 noindex，元信息不重复，canonical 始终为正式根地址。
- Electron 共用 HTML 源文件包含元信息且没有 noindex，Electron 构建配置未注册 Web 索引插件；未启动或打包 Electron，不声明桌面运行验收通过。
- 分享封面已通过本地 Chrome 生成并人工式图像检查，无文字溢出，使用仓库图标及字体。
- 未提交、未部署，线上抓取、分享平台缓存与实际展示仍待发布后确认；没有更改页面正文、路由和播放业务。
