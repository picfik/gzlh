import { Link } from "react-router-dom";
import type { TaskListItem } from "../types";

type TaskCardProps = {
  task: TaskListItem;
};

const taskStatusLabels: Record<TaskListItem["status"], string> = {
  pending: "待办理",
  in_progress: "办理中",
  completed: "已完成",
  archived: "已归档"
};

export function TaskCard({ task }: TaskCardProps) {
  return (
    <Link className="task-card" to={`/task/${encodeURIComponent(task.taskId)}`}>
      <div className="task-card__top">
        <h2>{task.title}</h2>
        <span className={`status-badge status-badge--${task.status}`}>
          {taskStatusLabels[task.status]}
        </span>
      </div>
      <p className="task-card__node">
        当前节点：{task.currentNodeName || "暂无"}
      </p>
      <span className="task-card__link">查看任务 <span aria-hidden="true">→</span></span>
    </Link>
  );
}
