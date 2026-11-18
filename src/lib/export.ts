import { signAttachmentUrl } from "./oss";
import type { ActionInstance, AuditEntry, TaskMetadata } from "../types";

const taskStatusLabels: Record<TaskMetadata["status"], string> = {
  pending: "待办理",
  in_progress: "办理中",
  completed: "已完成",
  archived: "已归档"
};

const actionLabels: Record<string, string> = {
  create_task: "创建任务",
  complete_action: "完成动作",
  undo_action: "撤销动作",
  complete_node: "完成节点",
  archive: "归档任务",
  update_action_basis: "更新制度依据",
  update_action_description: "更新动作说明",
  upload_attachment: "上传附件"
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function formatDate(value: string | number): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(String(value)) : date.toLocaleString("zh-CN");
}

function attachmentName(key: string): string {
  const objectName = key.split("/").pop() ?? key;
  const match = objectName.match(/_\d{13}_(.+)$/);
  const encodedName = match?.[1] ?? objectName;
  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
}

async function renderAction(action: ActionInstance): Promise<string> {
  const attachments = await Promise.all(
    action.attachmentKeys.map(async (key) => {
      const url = await signAttachmentUrl(key, 3600);
      return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" download>${escapeHtml(attachmentName(key))}</a></li>`;
    })
  );
  const status = action.status === "completed" ? "已完成" : "待办理";

  return `
    <article class="action">
      <div class="action__heading">
        <h3>${escapeHtml(action.name)}</h3>
        <span class="status">${status}</span>
      </div>
      <dl>
        <dt>制度依据</dt>
        <dd>${escapeHtml(action.regulationBasis || "未填写")}</dd>
        <dt>动作说明</dt>
        <dd>${escapeHtml(action.description || "无")}</dd>
        <dt>完成时间</dt>
        <dd>${action.completedAt === undefined ? "—" : formatDate(action.completedAt)}</dd>
        <dt>附件</dt>
        <dd>${attachments.length ? `<ul class="attachments">${attachments.join("")}</ul>` : "无"}</dd>
      </dl>
    </article>`;
}

function renderAuditEntry(entry: AuditEntry): string {
  const label = actionLabels[entry.action] ?? entry.action;
  return `
    <li class="audit-entry">
      <time>${formatDate(entry.timestamp)}</time>
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span>目标：${escapeHtml(entry.targetId)}</span>
        ${entry.detail ? `<p>${escapeHtml(entry.detail)}</p>` : ""}
      </div>
    </li>`;
}

/**
 * 生成包含任务、节点、动作、签名附件链接及审计时间线的打印 HTML。
 */
export async function createTaskRecordHtml(task: TaskMetadata): Promise<string> {
  const currentNode = task.nodes.find((node) => node.nodeId === task.currentNodeId);
  const nodes = await Promise.all(
    task.nodes.map(async (node) => {
      const actions = await Promise.all(node.actions.map(renderAction));
      const completedCount = node.actions.filter((action) => action.status === "completed").length;
      return `
        <section class="node">
          <div class="node__heading">
            <h2>${escapeHtml(node.name)}</h2>
            <span class="status">${completedCount}/${node.actions.length} 项动作完成</span>
          </div>
          ${actions.join("") || '<p class="muted">此节点没有动作</p>'}
        </section>`;
    })
  );
  const auditEntries = task.auditLog.map(renderAuditEntry);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(task.title)} - 办理记录</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0 auto; max-width: 210mm; color: #202b25; font: 12px/1.65 "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }
    h1 { margin: 0 0 7mm; font-size: 24px; line-height: 1.35; }
    h2 { margin: 0; font-size: 17px; }
    h3 { margin: 0; font-size: 14px; }
    .document-header { padding-bottom: 6mm; border-bottom: 2px solid #244c3c; }
    .eyebrow { margin: 0 0 3mm; color: #5d7467; font-size: 10px; font-weight: 700; letter-spacing: .12em; }
    .metadata { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 8mm; margin: 5mm 0 0; }
    .metadata div { display: grid; grid-template-columns: 25mm 1fr; gap: 2mm; }
    dt { color: #65746b; }
    dd { margin: 0; overflow-wrap: anywhere; }
    .node { margin-top: 9mm; }
    .node__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 5mm; padding-bottom: 2mm; border-bottom: 1px solid #b9c9bd; break-after: avoid; }
    .status { color: #506c5a; font-size: 10px; white-space: nowrap; }
    .action { margin: 4mm 0; padding: 4mm; border: 1px solid #d5ded7; border-radius: 2mm; break-inside: avoid-page; }
    .action__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; margin-bottom: 2mm; }
    .action dl { display: grid; grid-template-columns: 25mm 1fr; gap: 1mm 3mm; margin: 0; }
    .attachments { margin: 0; padding-left: 5mm; }
    a { color: #175c43; text-decoration: underline; overflow-wrap: anywhere; }
    .audit { margin-top: 10mm; break-before: page; }
    .audit h2 { padding-bottom: 2mm; border-bottom: 1px solid #b9c9bd; }
    .audit-list { display: grid; gap: 3mm; margin: 4mm 0 0; padding: 0; list-style: none; }
    .audit-entry { display: grid; grid-template-columns: 38mm 1fr; gap: 4mm; padding-bottom: 3mm; border-bottom: 1px solid #e3e9e4; break-inside: avoid; }
    .audit-entry time { color: #65746b; }
    .audit-entry span { margin-left: 3mm; color: #65746b; }
    .audit-entry p { margin: 1mm 0 0; overflow-wrap: anywhere; }
    .muted { color: #65746b; }
    @media screen {
      body { padding: 16mm; background: #fff; box-shadow: 0 2mm 12mm #173b3518; }
    }
    @media print {
      body { max-width: none; }
      a { color: #111; }
    }
  </style>
</head>
<body>
  <header class="document-header">
    <p class="eyebrow">合规助手 · 办理记录</p>
    <h1>${escapeHtml(task.title)}</h1>
    <dl class="metadata">
      <div><dt>任务编号</dt><dd>${escapeHtml(task.taskId)}</dd></div>
      <div><dt>任务状态</dt><dd>${escapeHtml(taskStatusLabels[task.status])}</dd></div>
      <div><dt>来源</dt><dd>${escapeHtml(task.source || "未填写")}</dd></div>
      <div><dt>当前节点</dt><dd>${escapeHtml(currentNode?.name ?? "暂无")}</dd></div>
      <div><dt>创建时间</dt><dd>${formatDate(task.createdAt)}</dd></div>
      <div><dt>最后修改</dt><dd>${formatDate(task.lastModified)}</dd></div>
    </dl>
  </header>
  <main>
    ${nodes.join("") || '<p class="muted">此任务没有流程节点</p>'}
    <section class="audit">
      <h2>审计时间线</h2>
      ${
        auditEntries.length
          ? `<ol class="audit-list">${auditEntries.join("")}</ol>`
          : '<p class="muted">暂无审计记录</p>'
      }
    </section>
  </main>
</body>
</html>`;
}

/**
 * 打开新窗口渲染任务记录，并在页面加载后启动打印对话框。
 */
export async function exportTaskRecord(task: TaskMetadata): Promise<void> {
  const printWindow = window.open("about:blank", "_blank");
  if (!printWindow) {
    throw new Error("无法打开导出窗口，请允许浏览器打开弹出窗口后重试");
  }

  printWindow.document.write(
    "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>正在准备导出</title></head><body>正在生成办理记录…</body></html>"
  );
  printWindow.document.close();

  try {
    const html = await createTaskRecordHtml(task);
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      if (!printWindow.closed) {
        printWindow.print();
      }
    }, 350);
  } catch (error) {
    printWindow.close();
    throw error;
  }
}
