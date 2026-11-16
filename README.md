# 合规助手 PWA

最小 Vite + React + TypeScript 项目骨架，包含 PWA 更新提示和 GitHub Pages 自动部署。

## 本地调试

```bash
npm ci
```

复制 `.env.example` 为 `.env`，填入 OSS 配置，然后运行：

```bash
npm run dev
npm run build
```

## GitHub Pages 部署

在仓库 Settings → Secrets and variables → Actions 中添加 `VITE_OSS_AK`、`VITE_OSS_SK`、`VITE_OSS_BUCKET` 和 `VITE_OSS_REGION`，推送到 `main` 后工作流会构建并发布 `dist` 到 `gh-pages` 分支。之后在 Settings → Pages 中选择 `gh-pages` 分支部署。

注意：`VITE_*` 变量会被打包进公开的浏览器代码，GitHub Secrets 不会保护最终构建产物中的 AK/SK。不要在公开站点使用有写权限的长期密钥；后续实现 OSS 时应优先采用受限凭据或服务端签名方案。

`public/icon.svg` 当前是占位图标，可在发布前替换。Service Worker 对阿里云 OSS 的 JSON 使用 NetworkFirst、附件使用 CacheFirst，并将 `/templates/`、`/tasks/` 路径排除在 SPA 导航回退之外。

示例采购流程模板见 [`template.json`](./template.json)，本地 OSS 调试、模板上传和 CORS 配置见 [`docs/OSS_DEBUGGING.md`](./docs/OSS_DEBUGGING.md)。
