import { Link } from "react-router-dom";
import type { TaskListItem } from "../types";

type TaskCardProps = {
  task: TaskListItem;
  isDeleting: boolean;
  isUpdating: boolean;
  disabled: boolean;
  onDelete: () => void;
  onToggleImportant: () => void;
  onToggleOnHold: () => void;
};

const taskStatusLabels: Record<TaskListItem["status"], string> = {
  pending: "待办理",
  in_progress: "办理中",
  completed: "已完成",
  archived: "已归档"
};

export function TaskCard({
  task,
  isDeleting,
  isUpdating,
  disabled,
  onDelete,
  onToggleImportant,
  onToggleOnHold
}: TaskCardProps) {
  return (
    <article className="task-card">
      <Link className="task-card__content" to={`/task/${encodeURIComponent(task.taskId)}`}>
        <div className="task-card__top">
          <h2>{task.title}</h2>
          <div className="task-card__badges">
            {task.isImportant && <span className="status-badge status-badge--important">重要</span>}
            {task.isOnHold && <span className="status-badge status-badge--on-hold">已搁置</span>}
            <span className={`status-badge status-badge--${task.status}`}>
              {taskStatusLabels[task.status]}
            </span>
          </div>
        </div>
        <p className="task-card__node">
          当前节点：{task.currentNodeName || "暂无"}
        </p>
        <span className="task-card__link">查看任务 <span aria-hidden="true">→</span></span>
      </Link>
      <div className="task-card__actions">
        <button
          className="task-card__flag"
          type="button"
          aria-pressed={Boolean(task.isImportant)}
          disabled={disabled || isDeleting || isUpdating}
          onClick={onToggleImportant}
        >
          {isUpdating ? "保存中…" : task.isImportant ? "取消重要" : "设为重要"}
        </button>
        <button
          className="task-card__flag"
          type="button"
          aria-pressed={Boolean(task.isOnHold)}
          disabled={disabled || isDeleting || isUpdating}
          onClick={onToggleOnHold}
        >
          {isUpdating ? "保存中…" : task.isOnHold ? "恢复办理" : "搁置任务"}
        </button>
        <button
          className="task-card__delete"
          type="button"
          disabled={disabled || isDeleting || isUpdating}
          onClick={onDelete}
        >
          {isDeleting ? "删除中…" : "删除任务"}
        </button>
      </div>
    </article>
  );
}
