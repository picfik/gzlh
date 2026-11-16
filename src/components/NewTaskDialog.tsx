import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getWorkflowCatalog } from "../lib/oss";
import type { Template, WorkflowCatalog } from "../types";

type NewTaskDialogProps = {
  templates: Template[];
  isOnline: boolean;
  onClose: () => void;
  onCreate: (
    templateId: string,
    title: string,
    source: string,
    workflowIds: Record<string, string>
  ) => Promise<void>;
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
  const [workflowCatalog, setWorkflowCatalog] = useState<WorkflowCatalog | null>(null);
  const [workflowCatalogLoading, setWorkflowCatalogLoading] = useState(true);
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedTemplate = templates.find((template) => template.templateId === templateId);
  const workflowGroupIds = [
    ...new Set(
      selectedTemplate?.nodes.flatMap((node) =>
        node.actions
          .filter((action) => !action.workflowId)
          .map((action) => action.workflowGroupId)
          .filter((groupId): groupId is string => Boolean(groupId))
      ) ?? []
    )
  ];

  useEffect(() => {
    let active = true;
    getWorkflowCatalog()
      .then((catalog) => {
        if (active) {
          setWorkflowCatalog(catalog);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(`加载采购流程失败：${reason instanceof Error ? reason.message : String(reason)}`);
        }
      })
      .finally(() => {
        if (active) {
          setWorkflowCatalogLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

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
    if (workflowGroupIds.length > 0) {
      for (const workflowGroupId of workflowGroupIds) {
        const workflowId = selectedWorkflowIds[workflowGroupId];
        const workflow = workflowCatalog?.groups
          .find((group) => group.workflowGroupId === workflowGroupId)
          ?.workflows.find((item) => item.workflowId === workflowId);
        if (!workflow) {
          setError(`请为任务选择${workflowGroupId}流程`);
          return;
        }
        if (workflow.steps.length === 0 || workflow.steps.some((step) => !step.name.trim())) {
          setError(`“${workflow.name}”尚未配置完整步骤，请先设置流程`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      await onCreate(
        templateId,
        title.trim(),
        source.trim(),
        selectedWorkflowIds
      );
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
                onChange={(event) => {
                  setTemplateId(event.target.value);
                  setSelectedWorkflowIds({});
                }}
              >
                <option value="" disabled>请选择模板</option>
                {templates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            {workflowGroupIds.map((workflowGroupId) => {
              const workflowGroup = workflowCatalog?.groups.find(
                (group) => group.workflowGroupId === workflowGroupId
              );
              return (
                <label className="field" key={workflowGroupId}>
                  <span>{workflowGroup?.name ?? "流程"}（必选）</span>
                  <select
                    required
                    disabled={
                      !isOnline ||
                      submitting ||
                      workflowCatalogLoading ||
                      !workflowCatalog
                    }
                    value={selectedWorkflowIds[workflowGroupId] ?? ""}
                    onChange={(event) =>
                      setSelectedWorkflowIds((current) => ({
                        ...current,
                        [workflowGroupId]: event.target.value
                      }))
                    }
                  >
                    <option value="" disabled>
                      {workflowCatalogLoading
                        ? "正在加载流程…"
                        : workflowCatalog
                          ? "请选择已配置的流程"
                          : "流程加载失败"}
                    </option>
                    {(workflowGroup?.workflows ?? []).map((workflow) => (
                      <option
                        key={workflow.workflowId}
                        value={workflow.workflowId}
                        disabled={
                          workflow.steps.length === 0 ||
                          workflow.steps.some((step) => !step.name.trim())
                        }
                      >
                        {workflow.name}
                        {workflow.steps.length === 0 ? "（尚未设置步骤）" : ""}
                      </option>
                    ))}
                  </select>
                  {!workflowGroup && workflowCatalog && (
                    <span className="field-hint">
                      模板引用的流程分组尚未配置。请前往<Link to="/workflow-settings">流程设置</Link>。
                    </span>
                  )}
                  {workflowGroup && (
                    <span className="field-hint">
                      任务将复制该流程步骤；必须按顺序完成。<Link to="/workflow-settings">设置流程</Link>
                    </span>
                  )}
                </label>
              );
            })}
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
                disabled={
                  submitting ||
                  !isOnline ||
                  (workflowGroupIds.length > 0 &&
                    (workflowCatalogLoading || !workflowCatalog))
                }
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
