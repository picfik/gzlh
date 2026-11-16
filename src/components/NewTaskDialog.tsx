import { useState, type FormEvent } from "react";
import type { Template } from "../types";

type NewTaskDialogProps = {
  templates: Template[];
  isOnline: boolean;
  onClose: () => void;
  onCreate: (templateId: string, title: string, source: string) => Promise<void>;
};

export function NewTaskDialog({
  templates,
  isOnline,
  onClose,
  onCreate
}: NewTaskDialogProps) {
  const [templateId, setTemplateId] = useState(templates[0]?.templateId ?? "");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");

    if (!isOnline || !navigator.onLine) {
      setError("离线状态无法保存");
      return;
    }
    if (!templateId) {
      setError("请先选择模板");
      return;
    }
    if (!title.trim()) {
      setError("请填写任务标题");
      return;
    }

    setSubmitting(true);
    try {
      await onCreate(templateId, title.trim(), source.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
      >
        <div className="dialog__heading">
          <div>
            <p className="eyebrow">新建办理事项</p>
            <h2 id="new-task-title">创建任务</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="关闭"
            disabled={submitting}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="dialog__empty">
            <p>OSS 中还没有可用模板，请先添加流程模板。</p>
            <button className="button button--primary" type="button" onClick={onClose}>
              知道了
            </button>
          </div>
        ) : (
          <form className="new-task-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="field">
              <span>流程模板</span>
              <select
                required
                disabled={!isOnline || submitting}
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                <option value="" disabled>请选择模板</option>
                {templates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>任务标题</span>
              <input
                autoFocus
                required
                disabled={!isOnline || submitting}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="输入本次办理事项"
              />
            </label>
            <label className="field">
              <span>来源</span>
              <input
                disabled={!isOnline || submitting}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="例如：年度计划、上级交办（选填）"
              />
            </label>
            {error && <p className="error-message" role="alert">{error}</p>}
            <div className="dialog__actions">
              <button
                className="button button--secondary"
                type="button"
                disabled={submitting}
                onClick={onClose}
              >
                取消
              </button>
              <button
                className="button button--primary"
                type="submit"
                disabled={submitting || !isOnline}
              >
                {submitting ? "创建中…" : !isOnline ? "离线状态无法保存" : "创建任务"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
