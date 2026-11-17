import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { NewTaskDialog } from "../components/NewTaskDialog";
import { TaskCard } from "../components/TaskCard";
import {
  createTaskFromTemplate,
  deleteTask,
  listTasks,
  listTemplates,
  setTaskDisposition
} from "../lib/oss";
import type { TaskListItem, Template } from "../types";

const TASK_CACHE_KEY = "compliance-assistant:task-list:v1";

function isTaskListItem(value: unknown): value is TaskListItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.taskId === "string" &&
    typeof item.title === "string" &&
    typeof item.currentNodeName === "string" &&
    (item.isImportant === undefined || typeof item.isImportant === "boolean") &&
    (item.isOnHold === undefined || typeof item.isOnHold === "boolean") &&
    (item.status === "pending" ||
      item.status === "in_progress" ||
      item.status === "completed" ||
      item.status === "archived")
  );
}

function readCachedTasks(): { tasks: TaskListItem[]; error: string } {
  try {
    const stored = window.localStorage.getItem(TASK_CACHE_KEY);
    if (!stored) {
      return { tasks: [], error: "" };
    }
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every(isTaskListItem)) {
      return { tasks: parsed, error: "" };
    }
    return { tasks: [], error: "本地任务缓存格式无效，将从 OSS 重新加载。" };
  } catch (reason) {
    return {
      tasks: [],
      error: `读取本地任务缓存失败：${reason instanceof Error ? reason.message : String(reason)}`
    };
  }
}

function sortTasks(items: TaskListItem[]): TaskListItem[] {
  return [...items].sort((left, right) => {
    const rank = (task: TaskListItem): number =>
      task.isImportant ? 0 : task.isOnHold ? 2 : 1;
    return rank(left) - rank(right);
  });
}

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function TaskList() {
  const navigate = useNavigate();
  const [cache] = useState(readCachedTasks);
  const [tasks, setTasks] = useState<TaskListItem[]>(cache.tasks);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(cache.tasks.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(cache.error);
  const [notice, setNotice] = useState("");
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const [updatingTaskId, setUpdatingTaskId] = useState("");
  const hasLoaded = useRef(cache.tasks.length > 0);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );

  const refresh = useCallback(async () => {
    setNotice("");
    if (!hasLoaded.current) {
      setIsLoading(true);
    }
    setIsRefreshing(true);

    try {
      const [freshTasks, freshTemplates] = await Promise.all([
        listTasks(),
        listTemplates()
      ]);
      setTasks(freshTasks);
      setTemplates(freshTemplates);
      hasLoaded.current = true;
      setError("");
      try {
        window.localStorage.setItem(TASK_CACHE_KEY, JSON.stringify(freshTasks));
      } catch (reason) {
        setError(`任务已从 OSS 加载，但本地缓存写入失败：${getErrorMessage(reason)}`);
      }
    } catch (reason) {
      setError(`加载 OSS 数据失败：${getErrorMessage(reason)}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function handleOnline(): void {
      setIsOnline(true);
      void refresh();
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
  }, [refresh]);

  async function handleCreateTask(
    templateId: string,
    title: string,
    source: string
  ): Promise<void> {
    try {
      if (!isOnline || !navigator.onLine) {
        throw new Error("离线状态无法保存");
      }
      const task = await createTaskFromTemplate(templateId, title, source);
      const currentNode = task.currentNodeId
        ? task.nodes.find((node) => node.nodeId === task.currentNodeId)
        : undefined;
      const taskItem: TaskListItem = {
        taskId: task.taskId,
        title: task.title,
        status: task.status,
        currentNodeName: currentNode?.name ?? ""
      };
      const updatedTasks = [
        taskItem,
        ...tasks.filter((item) => item.taskId !== task.taskId)
      ];
      setTasks(updatedTasks);
      hasLoaded.current = true;
      try {
        window.localStorage.setItem(TASK_CACHE_KEY, JSON.stringify(updatedTasks));
      } catch (reason) {
        window.alert(`任务已创建，但本地缓存写入失败：${getErrorMessage(reason)}`);
      }
      setShowNewTaskDialog(false);
      navigate(`/task/${encodeURIComponent(task.taskId)}`);
    } catch (reason) {
      throw new Error(`创建任务失败：${getErrorMessage(reason)}`, { cause: reason });
    }
  }

  async function handleDeleteTask(task: TaskListItem): Promise<void> {
    if (!isOnline || !navigator.onLine || isRefreshing || deletingTaskId) {
      return;
    }
    if (!window.confirm(
      `确定永久删除任务“${task.title}”吗？仍被其他任务引用的附件会保留在 OSS。`
    )) {
      return;
    }

    setDeletingTaskId(task.taskId);
    setError("");
    setNotice("");
    try {
      const result = await deleteTask(task.taskId);
      const updatedTasks = tasks.filter((item) => item.taskId !== task.taskId);
      setTasks(updatedTasks);
      hasLoaded.current = true;

      const cacheWarnings: string[] = [];
      try {
        window.localStorage.setItem(TASK_CACHE_KEY, JSON.stringify(updatedTasks));
      } catch (reason) {
        cacheWarnings.push(`任务列表缓存更新失败：${getErrorMessage(reason)}`);
      }
      try {
        window.localStorage.removeItem(`compliance-assistant:task:${task.taskId}`);
      } catch (reason) {
        cacheWarnings.push(`离线任务快照清理失败：${getErrorMessage(reason)}`);
      }

      const attachmentSummary =
        `已清理 ${result.deletedAttachmentCount} 个未被引用的附件，` +
        `保留 ${result.preservedAttachmentCount} 个仍被其他任务引用的附件。`;
      setNotice(
        `任务已删除。${attachmentSummary}` +
        (cacheWarnings.length > 0 ? ` ${cacheWarnings.join("；")}` : "")
      );
    } catch (reason) {
      const message = `删除任务失败：${getErrorMessage(reason)}`;
      setError(message);
      try {
        const freshTasks = await listTasks();
        setTasks(freshTasks);
        if (!freshTasks.some((item) => item.taskId === task.taskId)) {
          try {
            window.localStorage.removeItem(`compliance-assistant:task:${task.taskId}`);
          } catch (cacheReason) {
            setError(
              `${message}；任务记录已删除，但离线快照清理失败：${getErrorMessage(cacheReason)}`
            );
          }
        }
        try {
          window.localStorage.setItem(TASK_CACHE_KEY, JSON.stringify(freshTasks));
        } catch (cacheReason) {
          setError(`${message}；任务列表缓存更新失败：${getErrorMessage(cacheReason)}`);
        }
      } catch (refreshReason) {
        setError(`${message}；刷新任务列表失败：${getErrorMessage(refreshReason)}`);
      }
    } finally {
      setDeletingTaskId("");
    }
  }

  async function handleToggleDisposition(
    task: TaskListItem,
    disposition: "important" | "on_hold"
  ): Promise<void> {
    if (!isOnline || !navigator.onLine || isRefreshing || deletingTaskId || updatingTaskId) {
      return;
    }

    const enabled = disposition === "important"
      ? !task.isImportant
      : !task.isOnHold;
    setUpdatingTaskId(task.taskId);
    setError("");
    setNotice("");
    try {
      const updatedTask = await setTaskDisposition(task.taskId, disposition, enabled);
      const updatedTasks = tasks.map((item) =>
        item.taskId === task.taskId
          ? {
              ...item,
              isImportant: updatedTask.isImportant ?? false,
              isOnHold: updatedTask.isOnHold ?? false
            }
          : item
      );
      setTasks(updatedTasks);
      try {
        window.localStorage.setItem(TASK_CACHE_KEY, JSON.stringify(updatedTasks));
      } catch (reason) {
        setNotice(`标记已保存在 OSS，但本地缓存写入失败：${getErrorMessage(reason)}`);
      }
    } catch (reason) {
      setError(`更新任务标记失败：${getErrorMessage(reason)}`);
    } finally {
      setUpdatingTaskId("");
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">COMPLIANCE WORKSPACE</p>
          <h1>任务列表</h1>
          <p className="page-subtitle">跟进办理事项与当前流程节点</p>
        </div>
        <div className="page-header__actions">
          <Link className="button button--secondary" to="/workflow-settings">
            流程设置
          </Link>
          <button
            className="button button--primary"
            type="button"
            disabled={!isOnline || Boolean(deletingTaskId)}
            onClick={() => setShowNewTaskDialog(true)}
          >
            {isOnline ? "+ 新建任务" : "离线状态无法保存"}
          </button>
        </div>
      </header>

      {!isOnline && (
        <aside className="offline-banner" role="status">
          离线状态无法保存
        </aside>
      )}

      {error && (
        <div className="error-panel" role="alert">
          <span>{error}</span>
          <button
            className="button button--secondary"
            type="button"
            disabled={isRefreshing}
            onClick={() => void refresh()}
          >
            {isRefreshing ? "重试中…" : "重试"}
          </button>
        </div>
      )}
      {notice && <p className="success-message" role="status">{notice}</p>}

      {isLoading ? (
        <p className="loading-message">加载中…</p>
      ) : tasks.length === 0 ? (
        <section className="empty-state">
          <div className="empty-state__mark" aria-hidden="true">✓</div>
          <h2>还没有任务</h2>
          <p>点击“新建任务”，选择流程模板并填写办理事项。</p>
          {templates.length === 0 && (
            <p className="empty-state__hint">当前 OSS 中没有可用模板。</p>
          )}
        </section>
      ) : (
        <section className="task-grid" aria-label="任务列表">
          {sortTasks(tasks).map((task) => (
            <TaskCard
              key={task.taskId}
              task={task}
              isDeleting={deletingTaskId === task.taskId}
              isUpdating={updatingTaskId === task.taskId}
              disabled={!isOnline || isRefreshing || Boolean(deletingTaskId || updatingTaskId)}
              onDelete={() => void handleDeleteTask(task)}
              onToggleImportant={() => void handleToggleDisposition(task, "important")}
              onToggleOnHold={() => void handleToggleDisposition(task, "on_hold")}
            />
          ))}
        </section>
      )}

      {showNewTaskDialog && (
        <NewTaskDialog
          templates={templates}
          isOnline={isOnline}
          onClose={() => setShowNewTaskDialog(false)}
          onCreate={handleCreateTask}
        />
      )}
    </main>
  );
}
