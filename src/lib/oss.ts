import OSS from "ali-oss";
import {
  SCHEMA_VERSION,
  type AuditEntry,
  type NodeInstance,
  type TaskMetadata,
  type TaskStatus,
  type Template
} from "../types";

export let ossClient: OSS | null = null;

export async function initOss(): Promise<OSS> {
  if (ossClient) {
    return ossClient;
  }

  const { VITE_OSS_AK, VITE_OSS_SK, VITE_OSS_BUCKET, VITE_OSS_REGION } = import.meta.env;
  const missing = [
    ["VITE_OSS_AK", VITE_OSS_AK],
    ["VITE_OSS_SK", VITE_OSS_SK],
    ["VITE_OSS_BUCKET", VITE_OSS_BUCKET],
    ["VITE_OSS_REGION", VITE_OSS_REGION]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`OSS 配置缺失：${missing.join(", ")}`);
  }

  ossClient = new OSS({
    accessKeyId: VITE_OSS_AK,
    accessKeySecret: VITE_OSS_SK,
    bucket: VITE_OSS_BUCKET,
    region: VITE_OSS_REGION,
    secure: true
  });
  return ossClient;
}

async function listAllObjects(prefix: string, delimiter?: string): Promise<OSS.ObjectMeta[]> {
  const client = await initOss();
  const objects: OSS.ObjectMeta[] = [];
  let marker: string | undefined;
  let isTruncated = true;

  while (isTruncated) {
    const result = await client.list(
      {
        prefix,
        delimiter,
        marker,
        "max-keys": 1000
      },
      {}
    );
    objects.push(...(result.objects ?? []));
    isTruncated = result.isTruncated;
    marker = result.nextMarker;

    if (isTruncated && !marker) {
      throw new Error(`OSS 列表分页缺少游标：${prefix}`);
    }
  }

  return objects;
}

async function listTaskPrefixes(): Promise<string[]> {
  const client = await initOss();
  const prefixes = new Set<string>();
  let marker: string | undefined;
  let isTruncated = true;

  while (isTruncated) {
    const result = await client.list(
      {
        prefix: "tasks/",
        delimiter: "/",
        marker,
        "max-keys": 1000
      },
      {}
    );
    (result.prefixes ?? []).forEach((prefix) => prefixes.add(prefix));
    isTruncated = result.isTruncated;
    marker = result.nextMarker;

    if (isTruncated && !marker) {
      throw new Error("OSS 任务目录列表分页缺少游标");
    }
  }

  return [...prefixes];
}

async function readJson<T>(key: string): Promise<T> {
  const client = await initOss();
  const result = await client.get(key);
  const content: unknown = result.content;
  let jsonText: string;

  if (typeof content === "string") {
    jsonText = content;
  } else if (content instanceof Blob) {
    jsonText = await content.text();
  } else if (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) {
    jsonText = new TextDecoder().decode(content);
  } else {
    throw new Error(`OSS 对象内容不是可读取的 JSON 文本：${key}`);
  }

  try {
    return JSON.parse(jsonText) as T;
  } catch (error) {
    throw new Error(`OSS JSON 解析失败：${key}`, { cause: error });
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]);
      }
    })
  );

  return results;
}

export async function listTasks(): Promise<
  { taskId: string; title: string; status: TaskStatus; currentNodeName: string }[]
> {
  const prefixes = await listTaskPrefixes();
  const taskIds = prefixes
    .map((prefix) => prefix.slice("tasks/".length).replace(/\/$/, ""))
    .filter(Boolean);

  return mapWithConcurrency(taskIds, 5, async (taskId) => {
    const task = await loadTask(taskId);
    const currentNode = task.currentNodeId
      ? task.nodes.find((node) => node.nodeId === task.currentNodeId)
      : undefined;

    if (task.currentNodeId && !currentNode) {
      throw new Error(`任务 ${taskId} 的当前节点不存在：${task.currentNodeId}`);
    }

    return {
      taskId: task.taskId,
      title: task.title,
      status: task.status,
      currentNodeName: currentNode?.name ?? ""
    };
  });
}

export async function getTemplate(templateId: string): Promise<Template> {
  return readJson<Template>(`templates/${templateId}.json`);
}

export async function listTemplates(): Promise<Template[]> {
  const objects = await listAllObjects("templates/");
  const templateKeys = objects
    .map((object) => object.name)
    .filter((key) => /^templates\/[^/]+\.json$/.test(key));
  return Promise.all(templateKeys.map((key) => readJson<Template>(key)));
}

export async function loadTask(taskId: string): Promise<TaskMetadata> {
  return readJson<TaskMetadata>(`tasks/${taskId}/metadata.json`);
}

export async function saveTask(task: TaskMetadata): Promise<TaskMetadata> {
  const updatedTask: TaskMetadata = {
    ...task,
    lastModified: new Date().toISOString()
  };
  const client = await initOss();
  await client.put(
    `tasks/${updatedTask.taskId}/metadata.json`,
    JSON.stringify(updatedTask, null, 2),
    { headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
  return updatedTask;
}

function safeName(fileName: string): string {
  const normalizedName = fileName.normalize("NFKC");
  const extensionIndex = normalizedName.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const rawStem = hasExtension ? normalizedName.slice(0, extensionIndex) : normalizedName;
  const rawExtension = hasExtension ? normalizedName.slice(extensionIndex + 1) : "";
  const stem = rawStem.replace(/[^a-zA-Z0-9_-]/g, "") || "file";
  const extension = rawExtension.replace(/[^a-zA-Z0-9]/g, "");

  return extension ? `${stem}.${extension}` : stem;
}

function safePathSegment(value: string): string {
  return value.normalize("NFKC").replace(/[^a-zA-Z0-9_-]/g, "") || "item";
}

export async function uploadAttachment(
  taskId: string,
  actionId: string,
  file: File
): Promise<string> {
  const safeTaskId = safePathSegment(taskId);
  const safeActionId = safePathSegment(actionId);
  const key = `tasks/${safeTaskId}/attachments/${safeActionId}_${Date.now()}_${safeName(file.name)}`;
  const client = await initOss();
  await client.put(key, file, {
    headers: { "Content-Type": file.type || "application/octet-stream" }
  });
  return key;
}

export async function signAttachmentUrl(key: string, expires = 3600): Promise<string> {
  const client = await initOss();
  return client.signatureUrl(key, { expires });
}

export async function createTaskFromTemplate(
  templateId: string,
  title: string,
  source: string
): Promise<TaskMetadata> {
  const template = await getTemplate(templateId);
  const templateSnapshot = structuredClone(template);
  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();
  const nodes: NodeInstance[] = templateSnapshot.nodes.map((node) => ({
    schemaVersion: SCHEMA_VERSION,
    nodeId: node.nodeId,
    name: node.name,
    status: "pending",
    actions: node.actions.map((action) => ({
      schemaVersion: SCHEMA_VERSION,
      actionId: action.actionId,
      name: action.name,
      requireBasis: action.requireBasis,
      requireAttachment: action.requireAttachment,
      regulationBasis: "",
      description: action.description,
      attachmentKeys: [],
      status: "pending"
    }))
  }));
  const auditEntry: AuditEntry = {
    schemaVersion: SCHEMA_VERSION,
    timestamp: now,
    action: "create_task",
    targetId: taskId,
    detail: `Created from template ${templateId}`
  };
  const task: TaskMetadata = {
    schemaVersion: SCHEMA_VERSION,
    taskId,
    templateId,
    title,
    source,
    createdAt: now,
    lastModified: now,
    status: "pending",
    currentNodeId: nodes[0]?.nodeId ?? null,
    nodes,
    auditLog: [auditEntry]
  };

  return saveTask(task);
}
