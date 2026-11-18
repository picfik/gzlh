import { useEffect, useState } from "react";
import { canCompleteAction, canStartAction } from "../lib/flow";
import type { ActionInstance } from "../types";
import { AttachmentUploader } from "./AttachmentUploader";

type ActionCardProps = {
  action: ActionInstance;
  actions: ActionInstance[];
  saving: boolean;
  readOnly: boolean;
  onSaveBasis: (basis: string) => Promise<unknown>;
  onSaveDescription: (description: string) => Promise<unknown>;
  onUpload: (file: File) => Promise<void>;
  onRemoveAttachment: (key: string) => Promise<boolean>;
  onPreview: (key: string) => Promise<string>;
  onComplete: () => Promise<void>;
  onUndo: () => Promise<void>;
};

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function ActionCard({
  action,
  actions,
  saving,
  readOnly,
  onSaveBasis,
  onSaveDescription,
  onUpload,
  onRemoveAttachment,
  onPreview,
  onComplete,
  onUndo
}: ActionCardProps) {
  const [basis, setBasis] = useState(action.regulationBasis);
  const [description, setDescription] = useState(action.description);
  const [savingField, setSavingField] = useState(false);
  const [error, setError] = useState("");
  const gate = canCompleteAction({ ...action, regulationBasis: basis }, actions);
  const sequenceGate = canStartAction(action, actions);
  const sequenceBlocked = !sequenceGate.ok;
  const completed = action.status === "completed";

  useEffect(() => {
    setBasis(action.regulationBasis);
  }, [action.regulationBasis]);

  useEffect(() => {
    setDescription(action.description);
  }, [action.description]);

  async function saveBasis(): Promise<void> {
    if (basis === action.regulationBasis) {
      return;
    }
    setSavingField(true);
    setError("");
    try {
      await onSaveBasis(basis);
    } catch (reason) {
      setBasis(action.regulationBasis);
      setError(getErrorMessage(reason));
    } finally {
      setSavingField(false);
    }
  }

  async function saveDescription(): Promise<void> {
    if (description === action.description) {
      return;
    }
    setSavingField(true);
    setError("");
    try {
      await onSaveDescription(description);
    } catch (reason) {
      setDescription(action.description);
      setError(getErrorMessage(reason));
    } finally {
      setSavingField(false);
    }
  }

  async function runAction(operation: () => Promise<void>): Promise<void> {
    setError("");
    try {
      await operation();
    } catch (reason) {
      setError(getErrorMessage(reason));
    }
  }

  return (
    <article className={`action-card${completed ? " action-card--completed" : ""}`}>
      <div className="action-card__heading">
        <h3>{action.name}</h3>
        {completed && (
          <span className="action-completed">
            <span aria-hidden="true">✓</span> 已完成
          </span>
        )}
      </div>

      <label className="field">
        <span>制度依据{action.requireBasis && <b className="required-mark"> 必填</b>}</span>
        <textarea
          value={basis}
          rows={3}
          placeholder="填写制度、文件名称及条款依据"
          disabled={completed || saving || savingField || readOnly || sequenceBlocked}
          onChange={(event) => setBasis(event.target.value)}
          onBlur={() => void saveBasis()}
        />
      </label>

      <label className="field">
        <span>动作说明</span>
        <textarea
          value={description}
          rows={2}
          placeholder="填写动作说明"
          disabled={completed || saving || savingField || readOnly || sequenceBlocked}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => void saveDescription()}
        />
      </label>

      <AttachmentUploader
        attachmentKeys={action.attachmentKeys}
        required={action.requireAttachment}
        disabled={completed || saving || readOnly || sequenceBlocked}
        onUpload={onUpload}
        onRemove={onRemoveAttachment}
        onPreview={onPreview}
      />

      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="action-card__footer">
        {completed ? (
          <>
            <span className="action-completed__time">
              完成于 {action.completedAt ? new Date(action.completedAt).toLocaleString("zh-CN") : "—"}
            </span>
            <button
              className="button button--secondary"
              type="button"
              disabled={saving || readOnly}
              onClick={() => void runAction(onUndo)}
            >
              撤销完成
            </button>
          </>
        ) : (
          <>
            <div className="gate-reason" aria-live="polite">
              {!gate.ok && gate.reason}
            </div>
            <button
              className="button button--primary"
              type="button"
              disabled={!gate.ok || saving || savingField || readOnly}
              onClick={() => void runAction(onComplete)}
            >
              {saving ? "保存中…" : "完成"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
