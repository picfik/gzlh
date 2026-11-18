import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getWorkflowCatalog, saveWorkflowCatalog } from "../lib/oss";
import { SCHEMA_VERSION, type WorkflowCatalog } from "../types";

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function WorkflowSettings() {
  const [catalog, setCatalog] = useState<WorkflowCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    getWorkflowCatalog()
      .then((loadedCatalog) => {
        if (active) {
          setCatalog(loadedCatalog);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(`加载流程配置失败：${getErrorMessage(reason)}`);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function updateWorkflow(
    groupIndex: number,
    workflowIndex: number,
    update: (workflow: WorkflowCatalog["groups"][number]["workflows"][number]) =>
      WorkflowCatalog["groups"][number]["workflows"][number]
  ): void {
    setCatalog((current) => {
      if (!current) {
        return current;
      }
      const next = structuredClone(current);
      const group = next.groups[groupIndex];
      group.workflows[workflowIndex] = update(group.workflows[workflowIndex]);
      return next;
    });
    setNotice("");
  }

  function updateStep(
    groupIndex: number,
    workflowIndex: number,
    stepIndex: number,
    update: (step: WorkflowCatalog["groups"][number]["workflows"][number]["steps"][number]) =>
      WorkflowCatalog["groups"][number]["workflows"][number]["steps"][number]
  ): void {
    updateWorkflow(groupIndex, workflowIndex, (workflow) => {
      workflow.steps[stepIndex] = update(workflow.steps[stepIndex]);
      return workflow;
    });
  }

  function addWorkflow(groupIndex: number): void {
    setCatalog((current) => {
      if (!current) {
        return current;
      }
      const next = structuredClone(current);
      next.groups[groupIndex].workflows.push({
        schemaVersion: SCHEMA_VERSION,
        workflowId: crypto.randomUUID(),
        name: "新的采购方式",
        steps: []
      });
      return next;
    });
    setNotice("");
  }

  function removeWorkflow(groupIndex: number, workflowIndex: number): void {
    if (!window.confirm("删除此采购方式只影响今后创建的任务，已有任务快照不会改变。")) {
      return;
    }
    setCatalog((current) => {
      if (!current) {
        return current;
      }
      const next = structuredClone(current);
      if (next.groups[groupIndex].workflows.length <= 1) {
        return current;
      }
      next.groups[groupIndex].workflows.splice(workflowIndex, 1);
      return next;
    });
    setNotice("");
  }

  function addStep(groupIndex: number, workflowIndex: number): void {
    updateWorkflow(groupIndex, workflowIndex, (workflow) => {
      workflow.steps.push({
        schemaVersion: SCHEMA_VERSION,
        stepId: crypto.randomUUID(),
        name: "",
        requireBasis: false,
        requireAttachment: false,
        description: ""
      });
      return workflow;
    });
  }

  function moveStep(
    groupIndex: number,
    workflowIndex: number,
    stepIndex: number,
    offset: -1 | 1
  ): void {
    updateWorkflow(groupIndex, workflowIndex, (workflow) => {
      const targetIndex = stepIndex + offset;
      [workflow.steps[stepIndex], workflow.steps[targetIndex]] = [
        workflow.steps[targetIndex],
        workflow.steps[stepIndex]
      ];
      return workflow;
    });
  }

  function removeStep(
    groupIndex: number,
    workflowIndex: number,
    stepIndex: number
  ): void {
    updateWorkflow(groupIndex, workflowIndex, (workflow) => {
      workflow.steps.splice(stepIndex, 1);
      return workflow;
    });
  }

  async function handleSave(): Promise<void> {
    if (!catalog || saving) {
      return;
    }
    const invalidWorkflow = catalog.groups
      .flatMap((group) => group.workflows)
      .find(
        (workflow) =>
          !workflow.name.trim() ||
          workflow.steps.some((step) => !step.name.trim())
      );
    if (invalidWorkflow) {
      setError("请填写所有采购方式名称和步骤名称后再保存");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveWorkflowCatalog(catalog);
      setNotice("流程配置已保存。后续新建任务会使用最新配置，已创建任务不会改变。");
    } catch (reason) {
      setError(`保存流程配置失败：${getErrorMessage(reason)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell workflow-settings">
      <Link className="back-link" to="/">← 返回任务列表</Link>
      <header className="page-header">
        <div>
          <p className="eyebrow">REUSABLE WORKFLOWS</p>
          <h1>采购方式流程设置</h1>
          <p className="page-subtitle">
            自定义步骤、顺序及每步依据和附件要求；已创建任务保留原流程快照。
          </p>
        </div>
        <button
          className="button button--primary"
          type="button"
          disabled={loading || saving || !catalog}
          onClick={() => void handleSave()}
        >
          {saving ? "保存中…" : "保存流程"}
        </button>
      </header>

      {error && <p className="error-message workflow-message" role="alert">{error}</p>}
      {notice && <p className="success-message workflow-message" role="status">{notice}</p>}
      {loading ? (
        <p className="loading-message">加载流程配置中…</p>
      ) : catalog ? (
        catalog.groups.map((group, groupIndex) => (
          <section className="workflow-group" key={group.workflowGroupId}>
            <div className="workflow-group__heading">
              <div>
                <h2>{group.name}</h2>
                <p>进入任务执行节点选择一种采购方式后，将按下列顺序生成任务步骤。</p>
              </div>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => addWorkflow(groupIndex)}
              >
                + 添加采购方式
              </button>
            </div>
            <div className="workflow-method-list">
              {group.workflows.map((workflow, workflowIndex) => (
                <article className="workflow-method" key={workflow.workflowId}>
                  <div className="workflow-method__heading">
                    <label className="field">
                      <span>采购方式名称</span>
                      <input
                        value={workflow.name}
                        onChange={(event) =>
                          updateWorkflow(groupIndex, workflowIndex, (current) => ({
                            ...current,
                            name: event.target.value
                          }))
                        }
                      />
                    </label>
                    <button
                      className="text-button text-button--danger"
                      type="button"
                      disabled={group.workflows.length <= 1}
                      onClick={() => removeWorkflow(groupIndex, workflowIndex)}
                    >
                      删除方式
                    </button>
                  </div>
                  <ol className="workflow-step-list">
                    {workflow.steps.map((step, stepIndex) => (
                      <li className="workflow-step" key={step.stepId}>
                        <div className="workflow-step__heading">
                          <strong>第 {stepIndex + 1} 步</strong>
                          <div>
                            <button
                              className="text-button"
                              type="button"
                              disabled={stepIndex === 0}
                              aria-label={`将第 ${stepIndex + 1} 步上移`}
                              onClick={() =>
                                moveStep(groupIndex, workflowIndex, stepIndex, -1)
                              }
                            >
                              上移
                            </button>
                            <button
                              className="text-button"
                              type="button"
                              disabled={stepIndex === workflow.steps.length - 1}
                              aria-label={`将第 ${stepIndex + 1} 步下移`}
                              onClick={() =>
                                moveStep(groupIndex, workflowIndex, stepIndex, 1)
                              }
                            >
                              下移
                            </button>
                            <button
                              className="text-button text-button--danger"
                              type="button"
                              onClick={() =>
                                removeStep(groupIndex, workflowIndex, stepIndex)
                              }
                            >
                              删除
                            </button>
                          </div>
                        </div>
                        <label className="field">
                          <span>步骤名称</span>
                          <input
                            required
                            value={step.name}
                            onChange={(event) =>
                              updateStep(groupIndex, workflowIndex, stepIndex, (current) => ({
                                ...current,
                                name: event.target.value
                              }))
                            }
                            placeholder="例如：编制采购文件"
                          />
                        </label>
                        <label className="field">
                          <span>操作提示（选填）</span>
                          <textarea
                            rows={2}
                            value={step.description}
                            onChange={(event) =>
                              updateStep(groupIndex, workflowIndex, stepIndex, (current) => ({
                                ...current,
                                description: event.target.value
                              }))
                            }
                          />
                        </label>
                        <div className="workflow-step__requirements">
                          <label>
                            <input
                              type="checkbox"
                              checked={step.requireBasis}
                              onChange={(event) =>
                                updateStep(groupIndex, workflowIndex, stepIndex, (current) => ({
                                  ...current,
                                  requireBasis: event.target.checked
                                }))
                              }
                            />
                            强制填写制度依据
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={step.requireAttachment}
                              onChange={(event) =>
                                updateStep(groupIndex, workflowIndex, stepIndex, (current) => ({
                                  ...current,
                                  requireAttachment: event.target.checked
                                }))
                              }
                            />
                            强制上传附件
                          </label>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {workflow.steps.length === 0 && (
                    <p className="workflow-empty">尚未设置步骤；该方式暂不可用于新任务。</p>
                  )}
                  <button
                    className="button button--secondary button--small"
                    type="button"
                    onClick={() => addStep(groupIndex, workflowIndex)}
                  >
                    + 添加步骤
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))
      ) : null}
    </main>
  );
}
