import { Link } from "react-router-dom";
import { canCompleteNode } from "../lib/flow";
import type {
  ActionInstance,
  NodeInstance,
  TaskMetadata,
  WorkflowCatalog
} from "../types";
import { ActionCard } from "./ActionCard";

type NodePanelProps = {
  node: NodeInstance;
  isCurrent: boolean;
  expanded: boolean;
  saving: boolean;
  readOnly: boolean;
  workflowCatalog: WorkflowCatalog | null;
  workflowCatalogLoading: boolean;
  workflowError: string;
  onToggle: () => void;
  onSaveBasis: (actionId: string, basis: string) => Promise<TaskMetadata>;
  onSaveDescription: (actionId: string, description: string) => Promise<TaskMetadata>;
  onUpload: (actionId: string, file: File) => Promise<void>;
  onRemoveAttachment: (actionId: string, key: string) => Promise<boolean>;
  onPreview: (key: string) => Promise<string>;
  onCompleteAction: (actionId: string) => Promise<void>;
  onUndoAction: (actionId: string) => Promise<void>;
  onSelectWorkflow: (workflowGroupId: string, workflowId: string) => Promise<void>;
  onCompleteNode: () => void;
};

export function NodePanel({
  node,
  isCurrent,
  expanded,
  saving,
  readOnly,
  workflowCatalog,
  workflowCatalogLoading,
  workflowError,
  onToggle,
  onSaveBasis,
  onSaveDescription,
  onUpload,
  onRemoveAttachment,
  onPreview,
  onCompleteAction,
  onUndoAction,
  onSelectWorkflow,
  onCompleteNode
}: NodePanelProps) {
  const completedCount = node.actions.filter((action) => action.status === "completed").length;
  const selectedGroups = new Set(
    (node.workflowSelections ?? []).map((selection) => selection.workflowGroupId)
  );
  const unselectedSlots = (node.workflowSlots ?? []).filter(
    (slot) => !selectedGroups.has(slot.workflowGroupId)
  );
  const totalActions = node.actions.length + unselectedSlots.length;
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
          <span>{completedCount}/{totalActions} 已完成</span>
          <span className="node-panel__chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
        </span>
      </button>

      {expanded && (
        <div className="node-panel__body">
          {node.workflowSlots?.map((slot) => {
            const selection = node.workflowSelections?.find(
              (item) => item.workflowGroupId === slot.workflowGroupId
            );
            const workflowGroup = workflowCatalog?.groups.find(
              (item) => item.workflowGroupId === slot.workflowGroupId
            );
            if (selection) {
              return (
                <p className="workflow-selection" key={slot.placeholderActionId}>
                  本任务采购方式：<strong>{selection.workflowName}</strong>
                  （共 {selection.stepActionIds.length} 步，须按顺序完成）
                </p>
              );
            }
            return (
              <div className="workflow-picker" key={slot.placeholderActionId}>
                <label className="field">
                  <span>{slot.name}（在本执行节点选择）</span>
                  <select
                    required
                    value=""
                    disabled={
                      !isCurrent ||
                      saving ||
                      readOnly ||
                      workflowCatalogLoading ||
                      !workflowCatalog
                    }
                    onChange={(event) =>
                      void onSelectWorkflow(slot.workflowGroupId, event.target.value)
                    }
                  >
                    <option value="" disabled>
                      {workflowCatalogLoading
                        ? "正在加载已设置的流程…"
                        : workflowCatalog
                          ? "请选择一种采购方式"
                          : readOnly
                            ? "离线状态无法加载流程"
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
                </label>
                {!workflowGroup && workflowCatalog && (
                  <p className="error-message">
                    模板引用的流程分组未配置，请先到<Link to="/workflow-settings">流程设置</Link>。
                  </p>
                )}
                {workflowError && <p className="error-message">{workflowError}</p>}
                {workflowGroup && (
                  <p className="field-hint">
                    选择后，该方式的已配置步骤会显示在本节点，并按顺序开放。
                    <Link to="/workflow-settings">编辑流程</Link>
                  </p>
                )}
              </div>
            );
          })}
          {node.workflowSelections
            ?.filter(
              (selection) =>
                !node.workflowSlots?.some(
                  (slot) => slot.workflowGroupId === selection.workflowGroupId
                )
            )
            .map((selection) => (
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
