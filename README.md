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

在仓库 Settings → Secrets and variables → Actions 中添加 Repository secrets `VITE_OSS_AK`、`VITE_OSS_SK`，以及 Repository variables `VITE_OSS_BUCKET`、`VITE_OSS_REGION`。在 Settings → Pages 中将 Source 设为 GitHub Actions。推送到 `main` 后工作流会构建并通过 GitHub Pages Actions 发布 `dist`，无需 `gh-pages` 分支。

注意：`VITE_*` 变量会被打包进公开的浏览器代码，GitHub Secrets 不会保护最终构建产物中的 AK/SK。不要在公开站点使用有写权限的长期密钥；后续实现 OSS 时应优先采用受限凭据或服务端签名方案。

`public/icon.svg` 当前是占位图标，可在发布前替换。Service Worker 对阿里云 OSS 的 JSON 使用 NetworkFirst、附件使用 CacheFirst，并将 `/templates/`、`/tasks/` 路径排除在 SPA 导航回退之外。

示例采购流程模板见 [`template.json`](./template.json)，本地 OSS 调试、模板上传和 CORS 配置见 [`docs/OSS_DEBUGGING.md`](./docs/OSS_DEBUGGING.md)。

任务列表中的“流程设置”可维护可复用的采购方式及步骤。模板动作通过 `workflowGroupId` 引用流程组；新建任务时选择一种已配置方式，步骤会复制进任务快照并按顺序门禁。若模板动作同时指定 `workflowId`，则会自动套用该方式，无需在创建任务时选择。更新采购模板后，需将仓库根目录的 `template.json` 上传覆盖 OSS 中的 `templates/purchase-compliance.json`。
