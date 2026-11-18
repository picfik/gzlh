import {
  SCHEMA_VERSION,
  type ActionInstance,
  type AuditEntry,
  type NodeInstance,
  type TaskMetadata,
  type WorkflowDef,
  type WorkflowSelectionInstance
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

export function canStartAction(
  action: ActionInstance,
  actions: ActionInstance[]
): { ok: boolean; reason?: string } {
  if (!action.blockedByActionId) {
    return { ok: true };
  }
  const previousAction = actions.find(
    (item) => item.actionId === action.blockedByActionId
  );
  if (previousAction?.status !== "completed") {
    return { ok: false, reason: "请先完成前序流程" };
  }
  return { ok: true };
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
  action: ActionInstance,
  actions: ActionInstance[] = []
): { ok: boolean; reason?: string } {
  const sequenceGate = canStartAction(action, actions);
  if (!sequenceGate.ok) {
    return sequenceGate;
  }
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
  const node = findNode(task, nodeId);
  const action = findAction(task, nodeId, actionId);
  const gate = canCompleteAction(action, node.actions);
  if (!gate.ok) {
    throw new Error(gate.reason ?? "动作尚未满足完成条件");
  }

  const nextTask = copyTask(task);
  const nextAction = findAction(nextTask, nodeId, actionId);
  nextAction.status = "completed";
  nextAction.completedAt = Date.now();
  if (nextTask.status === "pending") {
    nextTask.status = "in_progress";
  }
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
  const node = findNode(task, nodeId);
  const action = findAction(task, nodeId, actionId);
  const sequenceGroupId = action.sequenceGroupId;
  const sequenceOrder = action.sequenceOrder;
  if (sequenceGroupId !== undefined && sequenceOrder !== undefined) {
    const completedLaterSteps = node.actions
      .filter(
        (item) =>
          item.sequenceGroupId === sequenceGroupId &&
          item.sequenceOrder !== undefined &&
          item.sequenceOrder > sequenceOrder &&
          item.status === "completed"
      )
      .map((item) => item.name);
    if (completedLaterSteps.length > 0) {
      throw new Error(`请先撤销后续流程：${completedLaterSteps.join("、")}`);
    }
  }
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
  const selectedGroups = new Set(
    (node.workflowSelections ?? []).map((selection) => selection.workflowGroupId)
  );
  const unselectedWorkflowNames = (node.workflowSlots ?? [])
    .filter((slot) => !selectedGroups.has(slot.workflowGroupId))
    .map((slot) => slot.name);
  pendingActions.push(...unselectedWorkflowNames);
  return { ok: pendingActions.length === 0, pendingActions };
}

export function selectWorkflowForNode(
  task: TaskMetadata,
  nodeId: string,
  workflowGroupId: string,
  workflow: WorkflowDef
): TaskMetadata {
  const node = findNode(task, nodeId);
  const slot = node.workflowSlots?.find(
    (item) => item.workflowGroupId === workflowGroupId
  );
  if (!slot) {
    throw new Error(`节点中不存在流程选择项：${workflowGroupId}`);
  }
  if (node.workflowSelections?.some(
    (selection) => selection.workflowGroupId === workflowGroupId
  )) {
    throw new Error("该节点已选择采购方式流程");
  }
  if (workflow.steps.length === 0 || workflow.steps.some((step) => !step.name.trim())) {
    throw new Error(`“${workflow.name}”尚未配置完整步骤`);
  }

  const nextTask = copyTask(task);
  const nextNode = findNode(nextTask, nodeId);
  const sequenceGroupId = `${slot.placeholderActionId}:${workflow.workflowId}`;
  const stepActionIds = workflow.steps.map(
    (step) => `${slot.placeholderActionId}:${workflow.workflowId}:${step.stepId}`
  );
  const generatedActions = workflow.steps.map((step, index): ActionInstance => ({
    schemaVersion: SCHEMA_VERSION,
    actionId: stepActionIds[index],
    name: step.name,
    requireBasis: step.requireBasis,
    requireAttachment: step.requireAttachment,
    regulationBasis: "",
    description: step.description,
    attachmentKeys: [],
    status: "pending",
    sequenceGroupId,
    sequenceOrder: index,
    templateOrder: slot.templateOrder,
    ...(index > 0 ? { blockedByActionId: stepActionIds[index - 1] } : {})
  }));
  const insertIndex = nextNode.actions.findIndex(
    (action) =>
      action.templateOrder !== undefined &&
      action.templateOrder > slot.templateOrder
  );
  if (insertIndex === -1) {
    nextNode.actions.push(...generatedActions);
  } else {
    nextNode.actions.splice(insertIndex, 0, ...generatedActions);
  }

  const selection: WorkflowSelectionInstance = {
    schemaVersion: SCHEMA_VERSION,
    workflowGroupId,
    workflowId: workflow.workflowId,
    workflowName: workflow.name,
    stepActionIds
  };
  nextNode.workflowSelections = [...(nextNode.workflowSelections ?? []), selection];
  nextTask.auditLog.push(
    createAuditEntry(
      "select_workflow",
      `${nodeId}:${workflowGroupId}`,
      `${workflow.workflowId}: ${workflow.name}`
    )
  );
  return nextTask;
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
    if (nextTask.status === "pending") {
      nextTask.status = "in_progress";
    }
  } else {
    nextTask.currentNodeId = null;
    nextTask.status = "archived";
  }
  nextTask.auditLog.push(createAuditEntry("complete_node", nodeId));
  if (!nextNode) {
    nextTask.auditLog.push(createAuditEntry("archive", nextTask.taskId));
  }
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
  const node = findNode(task, nodeId);
  const action = findAction(task, nodeId, actionId);
  assertActionCanStart(action, node.actions);
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
  const node = findNode(task, nodeId);
  const action = findAction(task, nodeId, actionId);
  assertActionCanStart(action, node.actions);
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
  const node = findNode(task, nodeId);
  const action = findAction(task, nodeId, actionId);
  assertActionCanStart(action, node.actions);
  const nextTask = copyTask(task);
  const nextAction = findAction(nextTask, nodeId, actionId);
  if (!nextAction.attachmentKeys.includes(key)) {
    nextAction.attachmentKeys.push(key);
  }
  nextTask.auditLog.push(createAuditEntry("upload_attachment", actionId, key));
  return nextTask;
}

/**
 * 从指定动作移除一个附件引用并追加审计记录。
 */
export function removeAttachmentFromAction(
  task: TaskMetadata,
  nodeId: string,
  actionId: string,
  key: string
): TaskMetadata {
  const node = findNode(task, nodeId);
  const action = findAction(task, nodeId, actionId);
  assertActionCanStart(action, node.actions);
  const attachmentIndex = action.attachmentKeys.indexOf(key);
  if (attachmentIndex === -1) {
    throw new Error("该动作未引用此附件");
  }

  const nextTask = copyTask(task);
  const nextAction = findAction(nextTask, nodeId, actionId);
  nextAction.attachmentKeys.splice(attachmentIndex, 1);
  nextTask.auditLog.push(createAuditEntry("remove_attachment", actionId, key));
  return nextTask;
}

/**
 * 更新任务名称并追加审计记录。
 */
export function updateTaskTitle(
  task: TaskMetadata,
  title: string
): TaskMetadata {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error("任务名称不能为空");
  }
  if (normalizedTitle === task.title) {
    return task;
  }

  const nextTask = copyTask(task);
  const previousTitle = nextTask.title;
  nextTask.title = normalizedTitle;
  nextTask.auditLog.push(
    createAuditEntry("update_task_title", nextTask.taskId, `${previousTitle} -> ${normalizedTitle}`)
  );
  return nextTask;
}

function assertActionCanStart(
  action: ActionInstance,
  actions: ActionInstance[]
): void {
  const gate = canStartAction(action, actions);
  if (!gate.ok) {
    throw new Error(gate.reason ?? "请先完成前序流程");
  }
}
