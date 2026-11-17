export const SCHEMA_VERSION = 1;

export type ActionStatus = "pending" | "completed";
export type NodeStatus = "pending" | "completed";
export type TaskStatus = "pending" | "in_progress" | "completed" | "archived";

export interface ActionDef {
  schemaVersion: number;
  actionId: string;
  name: string;
  requireBasis: boolean;
  requireAttachment: boolean;
  description: string;
  workflowGroupId?: string;
}

export interface WorkflowStepDef {
  schemaVersion: number;
  stepId: string;
  name: string;
  requireBasis: boolean;
  requireAttachment: boolean;
  description: string;
}

export interface WorkflowDef {
  schemaVersion: number;
  workflowId: string;
  name: string;
  steps: WorkflowStepDef[];
}

export interface WorkflowGroupDef {
  schemaVersion: number;
  workflowGroupId: string;
  name: string;
  workflows: WorkflowDef[];
}

export interface WorkflowCatalog {
  schemaVersion: number;
  groups: WorkflowGroupDef[];
}

export interface WorkflowSelectionInstance {
  schemaVersion: number;
  workflowGroupId: string;
  workflowId: string;
  workflowName: string;
  stepActionIds: string[];
}

export interface WorkflowSlotInstance {
  schemaVersion: number;
  workflowGroupId: string;
  placeholderActionId: string;
  name: string;
  description: string;
  templateOrder: number;
}

export interface NodeDef {
  schemaVersion: number;
  nodeId: string;
  name: string;
  description: string;
  actions: ActionDef[];
}

export interface Template {
  schemaVersion: number;
  templateId: string;
  name: string;
  description: string;
  nodes: NodeDef[];
}

export interface ActionInstance {
  schemaVersion: number;
  actionId: string;
  name: string;
  requireBasis: boolean;
  requireAttachment: boolean;
  regulationBasis: string;
  description: string;
  attachmentKeys: string[];
  status: ActionStatus;
  completedAt?: number;
  sequenceGroupId?: string;
  sequenceOrder?: number;
  blockedByActionId?: string;
  templateOrder?: number;
}

export interface NodeInstance {
  schemaVersion: number;
  nodeId: string;
  name: string;
  actions: ActionInstance[];
  status: NodeStatus;
  workflowSlots?: WorkflowSlotInstance[];
  workflowSelections?: WorkflowSelectionInstance[];
}

export interface AuditEntry {
  schemaVersion: number;
  timestamp: string;
  action: string;
  targetId: string;
  detail?: string;
}

export interface TaskMetadata {
  schemaVersion: number;
  taskId: string;
  templateId: string;
  title: string;
  isImportant?: boolean;
  isOnHold?: boolean;
  source: string;
  createdAt: string;
  lastModified: string;
  status: TaskStatus;
  currentNodeId: string | null;
  nodes: NodeInstance[];
  auditLog: AuditEntry[];
}

export type TaskListItem = {
  taskId: string;
  title: string;
  status: TaskStatus;
  currentNodeName: string;
  isImportant?: boolean;
  isOnHold?: boolean;
};
