import { useState } from "react";

type AttachmentUploaderProps = {
  attachmentKeys: string[];
  required?: boolean;
  disabled?: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove: (key: string) => Promise<boolean>;
  onPreview: (key: string) => Promise<string>;
};

function getFileName(key: string): string {
  const objectName = key.split("/").pop() ?? key;
  const match = objectName.match(/_\d{13}_(.+)$/);
  const encodedName = match?.[1] ?? objectName;
  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
}

export function AttachmentUploader({
  attachmentKeys,
  required = false,
  disabled = false,
  onUpload,
  onRemove,
  onPreview
}: AttachmentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [previewingKey, setPreviewingKey] = useState("");
  const [removingKey, setRemovingKey] = useState("");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleFileChange(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    setError("");
    setNotice("");
    setUploading(true);
    try {
      await onUpload(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(key: string): Promise<void> {
    if (!window.confirm("从当前动作移除此附件？若其他任务仍引用该文件，OSS 中的文件会保留。")) {
      return;
    }
    setError("");
    setNotice("");
    setRemovingKey(key);
    try {
      const deleted = await onRemove(key);
      setNotice(
        deleted
          ? "附件已移除，且 OSS 文件已删除。"
          : "附件已从当前动作移除；其他位置仍有引用，OSS 文件已保留。"
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRemovingKey("");
    }
  }

  async function handlePreview(key: string): Promise<void> {
    const previewWindow = window.open("about:blank", "_blank");
    if (previewWindow) {
      previewWindow.opener = null;
    }
    setError("");
    setPreviewingKey(key);
    try {
      const url = await onPreview(key);
      setPreviewUrls((current) => ({ ...current, [key]: url }));
      if (previewWindow) {
        previewWindow.location.href = url;
      }
    } catch (reason) {
      previewWindow?.close();
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPreviewingKey("");
    }
  }

  return (
    <section className="attachment-uploader">
      <div className="attachment-uploader__heading">
        <span>附件{required && <b className="required-mark"> 必传</b>}</span>
        {!disabled && (
          <label className="button button--secondary button--small">
            {uploading ? "上传中…" : "选择文件"}
            <input
              type="file"
              hidden
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                void handleFileChange(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        )}
      </div>

      {attachmentKeys.length === 0 ? (
        <p className="attachment-empty">尚未上传附件</p>
      ) : (
        <ul className="attachment-list">
          {attachmentKeys.map((key) => (
            <li className="attachment-item" key={key}>
              <span className="attachment-item__name" title={key}>{getFileName(key)}</span>
              <div className="attachment-item__actions">
                {previewUrls[key] && (
                  <a
                    href={previewUrls[key]}
                    target="_blank"
                    rel="noreferrer"
                    className="attachment-preview-link"
                  >
                    打开预览
                  </a>
                )}
                <button
                  className="text-button"
                  type="button"
                  disabled={previewingKey === key || removingKey === key}
                  onClick={() => void handlePreview(key)}
                >
                  {previewingKey === key ? "生成链接…" : "预览"}
                </button>
                {!disabled && (
                  <button
                    className="text-button text-button--danger"
                    type="button"
                    disabled={removingKey === key || previewingKey === key}
                    onClick={() => void handleRemove(key)}
                  >
                    {removingKey === key ? "移除中…" : "移除"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {notice && <p className="attachment-notice" role="status">{notice}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}
