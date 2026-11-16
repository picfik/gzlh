import { canCompleteNode } from "../lib/flow";
import type { ActionInstance, NodeInstance, TaskMetadata } from "../types";
import { ActionCard } from "./ActionCard";

type NodePanelProps = {
  node: NodeInstance;
  isCurrent: boolean;
  expanded: boolean;
  saving: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onSaveBasis: (actionId: string, basis: string) => Promise<TaskMetadata>;
  onSaveDescription: (actionId: string, description: string) => Promise<TaskMetadata>;
  onUpload: (actionId: string, file: File) => Promise<void>;
  onRemoveAttachment: (actionId: string, key: string) => Promise<boolean>;
  onPreview: (key: string) => Promise<string>;
  onCompleteAction: (actionId: string) => Promise<void>;
  onUndoAction: (actionId: string) => Promise<void>;
  onCompleteNode: () => void;
};

export function NodePanel({
  node,
  isCurrent,
  expanded,
  saving,
  readOnly,
  onToggle,
  onSaveBasis,
  onSaveDescription,
  onUpload,
  onRemoveAttachment,
  onPreview,
  onCompleteAction,
  onUndoAction,
  onCompleteNode
}: NodePanelProps) {
  const completedCount = node.actions.filter((action) => action.status === "completed").length;
  const gate = canCompleteNode(node);

  return (
    <section className={`node-panel${isCurrent ? " node-panel--current" : ""}`}>
      <button
        className="node-panel__toggle"
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="node-panel__title">
          <strong>{node.name}</strong>
          {isCurrent && <span className="current-node-badge">当前节点</span>}
        </span>
        <span className="node-panel__summary">
          <span>{completedCount}/{node.actions.length} 已完成</span>
          <span className="node-panel__chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
        </span>
      </button>

      {expanded && (
        <div className="node-panel__body">
          {node.workflowSelections?.map((selection) => (
            <p className="workflow-selection" key={selection.workflowId}>
              本任务采购方式：<strong>{selection.workflowName}</strong>
              （共 {selection.stepActionIds.length} 步，须按顺序完成）
            </p>
          ))}
          <div className="action-list">
            {node.actions.map((action: ActionInstance) => (
              <ActionCard
                key={action.actionId}
                action={action}
                actions={node.actions}
                saving={saving}
                readOnly={readOnly}
                onSaveBasis={(basis) => onSaveBasis(action.actionId, basis)}
                onSaveDescription={(description) =>
                  onSaveDescription(action.actionId, description)
                }
                onUpload={(file) => onUpload(action.actionId, file)}
                onRemoveAttachment={(key) => onRemoveAttachment(action.actionId, key)}
                onPreview={onPreview}
                onComplete={() => onCompleteAction(action.actionId)}
                onUndo={() => onUndoAction(action.actionId)}
              />
            ))}
          </div>

          <div className="node-panel__footer">
            {gate.pendingActions.length > 0 && (
              <p className="pending-actions">
                未完成动作：{gate.pendingActions.join("、")}
              </p>
            )}
            <button
              className="button button--primary"
              type="button"
              disabled={!isCurrent || !gate.ok || saving || readOnly || node.status === "completed"}
              onClick={onCompleteNode}
            >
              完成本节点并进入下一步
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
