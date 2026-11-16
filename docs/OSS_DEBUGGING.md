# OSS 调试说明

## 上传示例模板

模板需要以 JSON 对象保存在 Bucket 的 `templates/` 前缀下。上传仓库根目录的 `template.json`，对象 Key 使用：

```text
templates/purchase-compliance.json
```

可在阿里云 OSS 控制台进入目标 Bucket → 文件列表 → 上传文件，并将对象 Key 设置为上述路径。也可在安装并配置 `ossutil` 后，从仓库根目录运行：

```powershell
ossutil cp .\template.json oss://<bucket-name>/templates/purchase-compliance.json
```

上传后可在 OSS 控制台确认该对象存在；应用的 `listTemplates()` 会从 `templates/` 前缀读取 `.json` 对象。

## 附件复用与删除

上传附件时，应用会在 `tasks/` 对象中查找文件名及文件大小都相同的附件；命中时复用已有 OSS Key，只在当前任务 JSON 中新增引用。移除附件时先保存当前任务的引用变更，再扫描所有 `tasks/*/metadata.json`：仍有任意引用就保留 OSS 文件；确认零引用后才删除对象。因此 OSS 凭据需要能够列出 `tasks/`、读取任务元数据，并在无引用时删除附件对象。

文件名在 OSS Key 中使用 URL 编码，以保留原始文件名并避免不同文件名清洗后碰撞。历史上已上传且文件名经过有损清洗的旧 Key 不一定能安全匹配为同名文件，避免错误复用不同附件。

## 本地 `.env` 调试

1. 在项目根目录复制 `.env.example` 为 `.env`。
2. 填写自己的 OSS 参数：

   ```dotenv
   VITE_OSS_AK=your-access-key-id
   VITE_OSS_SK=your-access-key-secret
   VITE_OSS_BUCKET=your-bucket-name
   VITE_OSS_REGION=oss-cn-hangzhou
   ```

3. 确认 CORS 规则允许 `http://localhost:5173`，然后启动开发服务器：

   ```powershell
   npm run dev
   ```

修改 `.env` 后需重启 Vite。浏览器开发者工具的 Console 和 Network 面板可用于查看请求失败、CORS 拒绝或 OSS 返回的错误码。

## OSS CORS 配置要点

在 Bucket → 权限管理 → 跨域设置中添加规则：

- **允许来源（Origin）**：填入实际站点 Origin，例如 `https://<account>.github.io`；使用自定义域名时填其 `https://` Origin。Origin 不含仓库路径。开发调试另加 `http://localhost:5173`。
- **允许方法**：`GET`、`PUT`、`POST`、`HEAD`。
- **允许 Headers**：调试时可用 `*`；正式环境按实际请求限制，至少覆盖 `Content-Type`、`Authorization` 和 `x-oss-*` 请求头。
- **暴露 Headers**：建议加入 `ETag`、`x-oss-request-id`，便于前端检查上传结果和排查问题。
- **预检缓存时间**：可先设为 600 秒。

CORS 只控制浏览器跨域访问，不会授予 OSS 读写权限。若收到 `AccessDenied`，还需检查 AccessKey 对目标 Bucket/对象的授权策略。

> **密钥提醒：**`VITE_OSS_SK` 会进入浏览器端构建产物；GitHub Secrets 不会让客户端密钥保密。不要使用主账号或高权限长期密钥。公开部署前应采用严格受限的专用凭据，或改为服务端签名方案。不要提交实际 `.env` 文件。
