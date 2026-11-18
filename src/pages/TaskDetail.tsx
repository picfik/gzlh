import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { NodePanel } from "../components/NodePanel";
import {
  addAttachmentToAction,
  canStartAction,
  completeAction,
  completeNode,
  removeAttachmentFromAction,
  selectWorkflowForNode,
  undoAction,
  updateActionBasis,
  updateActionDescription,
  updateTaskTitle
} from "../lib/flow";
import {
  loadTask,
  saveTask,
  deleteAttachmentIfUnreferenced,
  getWorkflowCatalog,
  signAttachmentUrl,
  uploadAttachment
} from "../lib/oss";
import { exportTaskRecord } from "../lib/export";
import type { TaskMetadata, WorkflowCatalog } from "../types";

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

const taskStatusLabels: Record<TaskMetadata["status"], string> = {
  pending: "待办理",
  in_progress: "办理中",
  completed: "已完成",
  archived: "已归档"
};

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );
  const [isSnapshot, setIsSnapshot] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [workflowCatalog, setWorkflowCatalog] = useState<WorkflowCatalog | null>(null);
  const [workflowCatalogLoading, setWorkflowCatalogLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState("");
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const taskRef = useRef<TaskMetadata | null>(null);
  const operationInProgress = useRef(false);

  const readOnly = !isOnline || isSnapshot || isRefreshing;

  function cacheKey(id: string): string {
    return `compliance-assistant:task:${id}`;
  }

  function isTaskMetadata(value: unknown, expectedTaskId: string): value is TaskMetadata {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      candidate.taskId === expectedTaskId &&
      typeof candidate.title === "string" &&
      typeof candidate.templateId === "string" &&
      typeof candidate.createdAt === "string" &&
      typeof candidate.lastModified === "string" &&
      typeof candidate.status === "string" &&
      (typeof candidate.currentNodeId === "string" || candidate.currentNodeId === null) &&
      Array.isArray(candidate.nodes) &&
      Array.isArray(candidate.auditLog)
    );
  }

  function readTaskSnapshot(id: string): TaskMetadata | null {
    const stored = window.localStorage.getItem(cacheKey(id));
    if (!stored) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch (reason) {
      throw new Error(
        `本地任务快照解析失败：${getErrorMessage(reason)}`,
        { cause: reason }
      );
    }
    if (!isTaskMetadata(parsed, id)) {
      throw new Error("本地任务快照格式无效");
    }
    return parsed;
  }

  function setLoadedTask(loadedTask: TaskMetadata, snapshot: boolean): void {
    taskRef.current = loadedTask;
    setTask(loadedTask);
    setTitleDraft(loadedTask.title);
    setIsEditingTitle(false);
    setIsSnapshot(snapshot);
    setExpandedNodeId(loadedTask.currentNodeId);
  }

  function cacheTask(loadedTask: TaskMetadata): void {
    try {
      window.localStorage.setItem(cacheKey(loadedTask.taskId), JSON.stringify(loadedTask));
    } catch (reason) {
      setError(`任务已保存，但本地快照更新失败：${getErrorMessage(reason)}`);
    }
  }

  useEffect(() => {
    let active = true;
    if (taskRef.current?.taskId !== taskId) {
      taskRef.current = null;
      setTask(null);
      setIsSnapshot(false);
      setWorkflowCatalog(null);
      setWorkflowError("");
    }
    setError("");

    async function fetchTask(): Promise<void> {
      if (!taskId) {
        setError("任务 ID 缺失");
        setLoading(false);
        return;
      }

      const currentTask = taskRef.current;
      setLoading(!currentTask || currentTask.taskId !== taskId);
      setIsRefreshing(true);

      if (!navigator.onLine) {
        setIsOnline(false);
        try {
          const cachedTask = currentTask?.taskId === taskId
            ? currentTask
            : readTaskSnapshot(taskId);
          if (active && cachedTask) {
            setLoadedTask(cachedTask, currentTask?.taskId !== taskId);
          } else if (active) {
            setError("离线且没有可用的任务快照");
          }
        } catch (reason) {
          if (active) {
            setError(`读取离线任务快照失败：${getErrorMessage(reason)}`);
          }
        } finally {
          if (active) {
            setLoading(false);
            setIsRefreshing(false);
          }
        }
        return;
      }

      try {
        const loadedTask = await loadTask(taskId);
        if (active) {
          setLoadedTask(loadedTask, false);
          try {
            window.localStorage.setItem(cacheKey(loadedTask.taskId), JSON.stringify(loadedTask));
          } catch (reason) {
            setError(`任务已加载，但本地快照缓存失败：${getErrorMessage(reason)}`);
          }
          const needsWorkflowCatalog = loadedTask.nodes.some((node) =>
            (node.workflowSlots ?? []).some(
              (slot) =>
                !node.workflowSelections?.some(
                  (selection) => selection.workflowGroupId === slot.workflowGroupId
                )
            )
          );
          if (needsWorkflowCatalog) {
            setWorkflowCatalogLoading(true);
            setWorkflowError("");
            void getWorkflowCatalog()
              .then((catalog) => {
                if (active) {
                  setWorkflowCatalog(catalog);
                }
              })
              .catch((reason: unknown) => {
                if (active) {
                  setWorkflowError(`加载采购方式失败：${getErrorMessage(reason)}`);
                }
              })
              .finally(() => {
                if (active) {
                  setWorkflowCatalogLoading(false);
                }
              });
          }
        }
      } catch (reason) {
        if (active) {
          const loadError = getErrorMessage(reason);
          try {
            const current = taskRef.current?.taskId === taskId
              ? taskRef.current
              : readTaskSnapshot(taskId);
            if (current) {
              setLoadedTask(current, true);
              setError("");
            } else {
              setError(`加载任务失败：${loadError}`);
            }
          } catch (cacheError) {
            setError(`加载任务失败：${loadError}；读取本地快照失败：${getErrorMessage(cacheError)}`);
          }
        }
      } finally {
        if (active) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    void fetchTask();
    return () => {
      active = false;
    };
  }, [taskId, retryCount]);

  useEffect(() => {
    function handleOnline(): void {
      setIsOnline(true);
      setIsRefreshing(true);
      setRetryCount((count) => count + 1);
    }
    function handleOffline(): void {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const withOperationLock = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      if (!navigator.onLine || !isOnline || isSnapshot || isRefreshing) {
        throw new Error("离线状态无法保存");
      }
      if (operationInProgress.current) {
        throw new Error("正在保存，请稍后再试");
      }
      operationInProgress.current = true;
      setSaving(true);
      try {
        return await operation();
      } finally {
        operationInProgress.current = false;
        setSaving(false);
      }
    },
    [isOnline, isRefreshing, isSnapshot]
  );

  const persistUpdate = useCallback(
    async (update: (current: TaskMetadata) => TaskMetadata): Promise<TaskMetadata> =>
      withOperationLock(async () => {
        const currentTask = taskRef.current;
        if (!currentTask) {
          throw new Error("任务尚未加载");
        }
        const nextTask = update(currentTask);
        const savedTask = await saveTask(nextTask);
        taskRef.current = savedTask;
        setTask(savedTask);
        setIsSnapshot(false);
        cacheTask(savedTask);
        return savedTask;
      }),
    [withOperationLock]
  );

  async function handleSaveTitle(): Promise<void> {
    try {
      const savedTask = await persistUpdate((current) =>
        updateTaskTitle(current, titleDraft)
      );
      setTitleDraft(savedTask.title);
      setIsEditingTitle(false);
      setError("");

      try {
        const cachedTasks = window.localStorage.getItem("compliance-assistant:task-list:v1");
        if (cachedTasks) {
          const parsed: unknown = JSON.parse(cachedTasks);
          if (Array.isArray(parsed)) {
            const updatedTasks = parsed.map((item: unknown) => {
              if (
                typeof item === "object" &&
                item !== null &&
                "taskId" in item &&
                item.taskId === savedTask.taskId
              ) {
                return { ...item, title: savedTask.title };
              }
              return item;
            });
            window.localStorage.setItem(
              "compliance-assistant:task-list:v1",
              JSON.stringify(updatedTasks)
            );
          }
        }
      } catch (cacheReason) {
        setError(`任务名称已保存，但任务列表缓存更新失败：${getErrorMessage(cacheReason)}`);
      }
    } catch (reason) {
      window.alert(`修改任务名称失败：${getErrorMessage(reason)}`);
    }
  }

  async function handleUpload(nodeId: string, actionId: string, file: File): Promise<void> {
    await withOperationLock(async () => {
      const currentTask = taskRef.current;
      if (!currentTask || !taskId) {
        throw new Error("任务尚未加载");
      }
      const currentNode = currentTask.nodes.find((node) => node.nodeId === nodeId);
      const currentAction = currentNode?.actions.find(
        (action) => action.actionId === actionId
      );
      if (!currentNode || !currentAction) {
        throw new Error(`找不到动作：${actionId}`);
      }
      const sequenceGate = canStartAction(currentAction, currentNode.actions);
      if (!sequenceGate.ok) {
        throw new Error(sequenceGate.reason ?? "请先完成前序流程");
      }
      const key = await uploadAttachment(taskId, actionId, file);
      const nextTask = addAttachmentToAction(currentTask, nodeId, actionId, key);
      const savedTask = await saveTask(nextTask);
      taskRef.current = savedTask;
      setTask(savedTask);
      setIsSnapshot(false);
      cacheTask(savedTask);
    });
  }

  async function handleRemoveAttachment(
    nodeId: string,
    actionId: string,
    key: string
  ): Promise<boolean> {
    return withOperationLock(async () => {
      const currentTask = taskRef.current;
      if (!currentTask) {
        throw new Error("任务尚未加载");
      }

      const nextTask = removeAttachmentFromAction(currentTask, nodeId, actionId, key);
      const savedTask = await saveTask(nextTask);
      taskRef.current = savedTask;
      setTask(savedTask);
      setIsSnapshot(false);
      cacheTask(savedTask);

      return deleteAttachmentIfUnreferenced(key);
    });
  }

  async function handleCompleteNode(nodeId: string): Promise<void> {
    try {
      const savedTask = await persistUpdate((current) => completeNode(current, nodeId));
      setExpandedNodeId(savedTask.currentNodeId ?? nodeId);
    } catch (reason) {
      window.alert(`完成节点失败：${getErrorMessage(reason)}`);
    }
  }

  async function handleCompleteAction(nodeId: string, actionId: string): Promise<void> {
    try {
      await persistUpdate((current) => completeAction(current, nodeId, actionId));
    } catch (reason) {
      window.alert(`完成动作失败：${getErrorMessage(reason)}`);
    }
  }

  async function handleUndoAction(nodeId: string, actionId: string): Promise<void> {
    try {
      await persistUpdate((current) => undoAction(current, nodeId, actionId));
    } catch (reason) {
      window.alert(`撤销动作失败：${getErrorMessage(reason)}`);
    }
  }

  async function handlePreview(key: string): Promise<string> {
    return signAttachmentUrl(key);
  }

  async function handleSelectWorkflow(
    nodeId: string,
    workflowGroupId: string,
    workflowId: string
  ): Promise<void> {
    try {
      const catalog = await getWorkflowCatalog();
      const workflow = catalog.groups
        .find((group) => group.workflowGroupId === workflowGroupId)
        ?.workflows.find((item) => item.workflowId === workflowId);
      if (!workflow) {
        throw new Error(`找不到所选采购方式：${workflowId}`);
      }
      setWorkflowCatalog(catalog);
      const savedTask = await persistUpdate((current) =>
        selectWorkflowForNode(current, nodeId, workflowGroupId, workflow)
      );
      taskRef.current = savedTask;
    } catch (reason) {
      window.alert(`选择采购方式失败：${getErrorMessage(reason)}`);
    }
  }

  async function handleExport(): Promise<void> {
    if (!task || saving || exporting) {
      return;
    }
    setExporting(true);
    setError("");
    try {
      await exportTaskRecord(task);
    } catch (reason) {
      const message = `导出记录失败：${getErrorMessage(reason)}`;
      setError(message);
      window.alert(message);
    } finally {
      setExporting(false);
    }
  }

  function retryLoad(): void {
    setIsRefreshing(true);
    setRetryCount((count) => count + 1);
  }

  const currentNode = task?.status === "archived"
    ? undefined
    : task?.nodes.find((node) => node.nodeId === task.currentNodeId);

  if (loading) {
    return (
      <main className="page-shell">
        <p className="loading-message">加载中…</p>
      </main>
    );
  }

  if (!task) {
    return (
      <main className="page-shell">
        <Link className="back-link" to="/">← 返回任务列表</Link>
        <div className="error-panel" role="alert">
          <span>{error || "无法加载任务"}</span>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
          >
            重试
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell task-detail">
      <Link className="back-link" to="/">← 返回任务列表</Link>
      {(isSnapshot || !isOnline || (isRefreshing && task)) && (
        <aside className="offline-banner" role="status">
          <div>
            <strong>
              {isSnapshot || !isOnline
                ? "离线模式，数据可能不是最新"
                : "正在重新连接并同步任务"}
            </strong>
            {readOnly && <span>离线状态无法保存</span>}
          </div>
          <button
            className="button button--secondary button--small"
            type="button"
            disabled={isRefreshing}
            onClick={retryLoad}
          >
            {isRefreshing ? "重试中…" : "重试"}
          </button>
        </aside>
      )}
      <header className="detail-header">
        <div className="detail-header__title">
          <p className="eyebrow">TASK DETAIL</p>
          {isEditingTitle ? (
            <div className="detail-title-editor">
              <label className="field" htmlFor="task-title-input">
                <span>任务名称</span>
              </label>
              <div className="detail-title-editor__row">
                <input
                  id="task-title-input"
                  className="detail-title-editor__input"
                  value={titleDraft}
                  disabled={saving || readOnly}
                  autoFocus
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSaveTitle();
                    }
                    if (event.key === "Escape") {
                      setTitleDraft(task.title);
                      setIsEditingTitle(false);
                    }
                  }}
                />
                <button
                  className="button button--primary button--small"
                  type="button"
                  disabled={saving || readOnly || !titleDraft.trim()}
                  onClick={() => void handleSaveTitle()}
                >
                  保存
                </button>
                <button
                  className="button button--secondary button--small"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setTitleDraft(task.title);
                    setIsEditingTitle(false);
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="detail-title-heading">
              <h1>{task.title}</h1>
              <button
                className="text-button detail-title-heading__edit"
                type="button"
                disabled={saving || readOnly}
                onClick={() => setIsEditingTitle(true)}
              >
                修改名称
              </button>
            </div>
          )}
          <p className="detail-source">来源：{task.source || "未填写"}</p>
        </div>
        <div className="detail-summary">
          <div>
            <span className="detail-summary__label">任务状态</span>
            <strong>{taskStatusLabels[task.status]}</strong>
          </div>
          <div>
            <span className="detail-summary__label">当前节点</span>
            <strong>{currentNode?.name ?? "暂无"}</strong>
          </div>
        </div>
        <button
          className="button button--secondary export-button"
          type="button"
          disabled={saving || exporting}
          onClick={() => void handleExport()}
        >
          {exporting ? "正在准备…" : "导出记录"}
        </button>
      </header>

      {error && <p className="error-message" role="alert">{error}</p>}

      <section className="node-list" aria-label="任务流程节点">
        {task.nodes.map((node) => (
          <NodePanel
            key={node.nodeId}
            node={node}
            isCurrent={node.nodeId === task.currentNodeId}
            expanded={expandedNodeId === node.nodeId}
            saving={saving}
            readOnly={readOnly}
            workflowCatalog={workflowCatalog}
            workflowCatalogLoading={workflowCatalogLoading}
            workflowError={workflowError}
            onToggle={() =>
              setExpandedNodeId((current) => current === node.nodeId ? null : node.nodeId)
            }
            onSaveBasis={(actionId, basis) =>
              persistUpdate((current) => updateActionBasis(current, node.nodeId, actionId, basis))
            }
            onSaveDescription={(actionId, description) =>
              persistUpdate((current) =>
                updateActionDescription(current, node.nodeId, actionId, description)
              )
            }
            onUpload={(actionId, file) => handleUpload(node.nodeId, actionId, file)}
            onRemoveAttachment={(actionId, key) =>
              handleRemoveAttachment(node.nodeId, actionId, key)
            }
            onPreview={handlePreview}
            onCompleteAction={(actionId) => handleCompleteAction(node.nodeId, actionId)}
            onUndoAction={(actionId) => handleUndoAction(node.nodeId, actionId)}
            onSelectWorkflow={(workflowGroupId, workflowId) =>
              handleSelectWorkflow(node.nodeId, workflowGroupId, workflowId)
            }
            onCompleteNode={() => void handleCompleteNode(node.nodeId)}
          />
        ))}
      </section>
    </main>
  );
}
