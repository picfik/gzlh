import {
  SCHEMA_VERSION,
  type ActionInstance,
  type AuditEntry,
  type NodeInstance,
  type TaskMetadata
} from "../types";

/** 按 ID 查找节点，不存在时抛出中文错误。 */
function findNode(task: TaskMetadata, nodeId: string): NodeInstance {
  const node = task.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new Error(`找不到节点：${nodeId}`);
  }
  return node;
}

/** 按节点和动作 ID 查找动作，不存在时抛出中文错误。 */
function findAction(
  task: TaskMetadata,
  nodeId: string,
  actionId: string
): ActionInstance {
  const node = findNode(task, nodeId);
  const action = node.actions.find((item) => item.actionId === actionId);
  if (!action) {
    throw new Error(`找不到动作：${actionId}`);
  }
  return action;
}

/** 创建带版本号和时间戳的审计记录。 */
function createAuditEntry(
  action: string,
  targetId: string,
  detail?: string
): AuditEntry {
  return {
    schemaVersion: SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    action,
    targetId,
    ...(detail === undefined ? {} : { detail })
  };
}

/** 通过 structuredClone 创建任务的深拷贝。 */
function copyTask(task: TaskMetadata): TaskMetadata {
  return structuredClone(task);
}

/**
 * 检查动作是否满足制度依据和附件门禁。
 */
export function canCompleteAction(
  action: ActionInstance
): { ok: boolean; reason?: string } {
  if (action.requireBasis && action.regulationBasis.trim().length === 0) {
    return { ok: false, reason: "请先填写制度依据" };
  }
  if (action.requireAttachment && action.attachmentKeys.length === 0) {
    return { ok: false, reason: "请先上传附件" };
  }
  return { ok: true };
}

/**
 * 完成指定动作并追加审计记录，不推进节点。
 */
export function completeAction(
  task: TaskMetadata,
  nodeId: string,
  actionId: string
): TaskMetadata {
  const action = findAction(task, nodeId, actionId);
  const gate = canCompleteAction(action);
  if (!gate.ok) {
    throw new Error(gate.reason ?? "动作尚未满足完成条件");
  }

  const nextTask = copyTask(task);
  const nextAction = findAction(nextTask, nodeId, actionId);
  nextAction.status = "completed";
  nextAction.completedAt = Date.now();
  nextTask.auditLog.push(createAuditEntry("complete_action", actionId));
  return nextTask;
}

/**
 * 撤销指定动作的完成状态并追加审计记录。
 */
export function undoAction(
  task: TaskMetadata,
  nodeId: string,
  actionId: string
): TaskMetadata {
  findAction(task, nodeId, actionId);
  const nextTask = copyTask(task);
  const nextAction = findAction(nextTask, nodeId, actionId);
  nextAction.status = "pending";
  delete nextAction.completedAt;
  nextTask.auditLog.push(createAuditEntry("undo_action", actionId));
  return nextTask;
}

/**
 * 返回节点中尚未完成的动作名称。
 */
export function canCompleteNode(
  node: NodeInstance
): { ok: boolean; pendingActions: string[] } {
  const pendingActions = node.actions
    .filter((action) => action.status !== "completed")
    .map((action) => action.name);
  return { ok: pendingActions.length === 0, pendingActions };
}

/**
 * 完成节点；若存在后续节点则将 currentNodeId 推进到该节点。
 */
export function completeNode(
  task: TaskMetadata,
  nodeId: string
): TaskMetadata {
  const node = findNode(task, nodeId);
  const gate = canCompleteNode(node);
  if (!gate.ok) {
    throw new Error(`节点仍有未完成动作：${gate.pendingActions.join("、")}`);
  }

  const nextTask = copyTask(task);
  const nodeIndex = nextTask.nodes.findIndex((item) => item.nodeId === nodeId);
  const nextNode = nextTask.nodes[nodeIndex + 1];
  nextTask.nodes[nodeIndex].status = "completed";
  if (nextNode) {
    nextTask.currentNodeId = nextNode.nodeId;
  }
  nextTask.auditLog.push(createAuditEntry("complete_node", nodeId));
  return nextTask;
}

/**
 * 仅在所有节点完成后归档任务。
 */
export function archiveTask(task: TaskMetadata): TaskMetadata {
  if (!task.nodes.every((node) => node.status === "completed")) {
    throw new Error("所有节点完成后才能归档任务");
  }

  const nextTask = copyTask(task);
  nextTask.status = "archived";
  nextTask.auditLog.push(createAuditEntry("archive", task.taskId));
  return nextTask;
}

/**
 * 更新动作的制度依据并追加审计记录。
 */
export function updateActionBasis(
  task: TaskMetadata,
  nodeId: string,
  actionId: string,
  basis: string
): TaskMetadata {
  findAction(task, nodeId, actionId);
  const nextTask = copyTask(task);
  findAction(nextTask, nodeId, actionId).regulationBasis = basis;
  nextTask.auditLog.push(createAuditEntry("update_action_basis", actionId, basis));
  return nextTask;
}

/**
 * 更新动作说明并追加审计记录。
 */
export function updateActionDescription(
  task: TaskMetadata,
  nodeId: string,
  actionId: string,
  desc: string
): TaskMetadata {
  findAction(task, nodeId, actionId);
  const nextTask = copyTask(task);
  findAction(nextTask, nodeId, actionId).description = desc;
  nextTask.auditLog.push(createAuditEntry("update_action_description", actionId, desc));
  return nextTask;
}

/**
 * 将附件 Key 关联到动作并追加上传审计记录。
 */
export function addAttachmentToAction(
  task: TaskMetadata,
  nodeId: string,
  actionId: string,
  key: string
): TaskMetadata {
  findAction(task, nodeId, actionId);
  const nextTask = copyTask(task);
  findAction(nextTask, nodeId, actionId).attachmentKeys.push(key);
  nextTask.auditLog.push(createAuditEntry("upload_attachment", actionId, key));
  return nextTask;
}
