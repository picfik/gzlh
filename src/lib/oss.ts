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
  const metadataKeys = (await listAllObjects("tasks/"))
    .map((object) => object.name)
    .filter((key) => /^tasks\/[^/]+\/metadata\.json$/.test(key));
  const taskIds = metadataKeys.map((key) => key.split("/")[1]);

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
    new Blob([JSON.stringify(updatedTask, null, 2)], {
      type: "application/json; charset=utf-8"
    })
  );
  return updatedTask;
}

function safeName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const stem = hasExtension ? fileName.slice(0, extensionIndex) : fileName;
  const extension = hasExtension ? fileName.slice(extensionIndex + 1) : "";
  const encodeSegment = (value: string): string =>
    encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
  const safeStem = encodeSegment(stem) || "file";
  return extension ? `${safeStem}.${encodeSegment(extension)}` : safeStem;
}

function safePathSegment(value: string): string {
  return value.normalize("NFKC").replace(/[^a-zA-Z0-9_-]/g, "") || "item";
}

export async function uploadAttachment(
  taskId: string,
  actionId: string,
  file: File
): Promise<string> {
  const client = await initOss();
  const encodedName = safeName(file.name);
  const existingObjects = await listAllObjects("tasks/");
  const existingMatch = existingObjects.find((object) => {
    if (object.size !== file.size || !object.name.includes("/attachments/")) {
      return false;
    }
    const objectName = object.name.split("/").pop() ?? "";
    const match = objectName.match(/_\d{13}_(.+)$/);
    return match?.[1] === encodedName;
  });

  if (existingMatch) {
    return existingMatch.name;
  }

  const safeTaskId = safePathSegment(taskId);
  const safeActionId = safePathSegment(actionId);
  const key = `tasks/${safeTaskId}/attachments/${safeActionId}_${Date.now()}_${encodedName}`;
  await client.put(key, file, {
    headers: { "Content-Type": file.type || "application/octet-stream" }
  });
  return key;
}

/**
 * 删除附件引用后扫描所有任务；仅在全局引用数为零时删除 OSS 对象。
 */
export async function deleteAttachmentIfUnreferenced(key: string): Promise<boolean> {
  if (!/^tasks\/[^/]+\/attachments\/.+$/.test(key)) {
    throw new Error(`无效的附件 OSS Key：${key}`);
  }

  const client = await initOss();
  const metadataKeys = (await listAllObjects("tasks/"))
    .map((object) => object.name)
    .filter((objectKey) => /^tasks\/[^/]+\/metadata\.json$/.test(objectKey));
  const tasks = await mapWithConcurrency(metadataKeys, 5, (metadataKey) =>
    readJson<TaskMetadata>(metadataKey)
  );
  const referenceCount = tasks.reduce(
    (count, task) =>
      count +
      task.nodes.reduce(
        (nodeCount, node) =>
          nodeCount +
          node.actions.reduce(
            (actionCount, action) =>
              actionCount +
              action.attachmentKeys.filter((attachmentKey) => attachmentKey === key).length,
            0
          ),
        0
      ),
    0
  );

  if (referenceCount > 0) {
    return false;
  }

  await client.delete(key);
  return true;
}

export async function deleteTask(
  taskId: string
): Promise<{ deletedAttachmentCount: number; preservedAttachmentCount: number }> {
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
    throw new Error(`无效的任务 ID：${taskId}`);
  }

  const task = await loadTask(taskId);
  if (task.taskId !== taskId) {
    throw new Error(`任务元数据 ID 不匹配：${taskId}`);
  }

  const client = await initOss();
  const objects = await listAllObjects("tasks/");
  const metadataKey = `tasks/${taskId}/metadata.json`;
  const otherMetadataKeys = objects
    .map((object) => object.name)
    .filter(
      (key) =>
        /^tasks\/[^/]+\/metadata\.json$/.test(key) &&
        key !== metadataKey
    );
  const otherTasks = await mapWithConcurrency(otherMetadataKeys, 5, (key) =>
    readJson<TaskMetadata>(key)
  );
  const otherReferences = new Set(
    otherTasks.flatMap((otherTask) =>
      otherTask.nodes.flatMap((node) =>
        node.actions.flatMap((action) => action.attachmentKeys)
      )
    )
  );
  const existingObjectKeys = new Set(objects.map((object) => object.name));
  const taskAttachmentPrefix = `tasks/${taskId}/attachments/`;
  const taskAttachmentKeys = new Set([
    ...objects
      .map((object) => object.name)
      .filter((key) => key.startsWith(taskAttachmentPrefix)),
    ...task.nodes.flatMap((node) =>
      node.actions.flatMap((action) => action.attachmentKeys)
    )
  ]);
  const attachmentKeys = [...taskAttachmentKeys].filter(
    (key) =>
      existingObjectKeys.has(key) &&
      /^tasks\/[^/]+\/attachments\/.+$/.test(key)
  );
  const unsharedAttachmentKeys = attachmentKeys.filter(
    (key) => !otherReferences.has(key)
  );
  const preservedAttachmentCount = attachmentKeys.length - unsharedAttachmentKeys.length;

  await client.delete(metadataKey);

  let deletedAttachmentCount = 0;
  for (const key of unsharedAttachmentKeys) {
    try {
      await client.delete(key);
      deletedAttachmentCount += 1;
    } catch (error) {
      throw new Error(
        `任务元数据已删除，但清理附件失败；其余附件仍保留在 OSS：${key}`,
        { cause: error }
      );
    }
  }

  return { deletedAttachmentCount, preservedAttachmentCount };
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
