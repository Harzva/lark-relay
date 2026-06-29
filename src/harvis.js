import { readFile } from "node:fs/promises";
import { buildAgentRoomProjection, isMobileCodePayload } from "./agent-room.js";
import { payloadToHarvisText, redact } from "./payloads.js";

export class HarvisClient {
  constructor(config, { fetchImpl = globalThis.fetch } = {}) {
    if (!fetchImpl) throw new Error("HarvisClient requires fetch; use Node.js 20+.");
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.baseUrl = config.harvis.baseUrl.replace(/\/+$/, "");
  }

  async route(event, payload) {
    if (this.config.safety.dryRunHarvis) {
      return {
        dryRun: true,
        routerMessage: { skipped: true },
        agentRoomMessage: { skipped: true },
        taskStatus: { skipped: true }
      };
    }

    const headers = await this.headers();
    const text = payloadToHarvisText(payload);
    const root = this.config.harvis.workspaceRoot || undefined;
    const metadata = redact({
      source: "lark-relay",
      payload,
      lark: {
        event_id: event.eventId,
        message_id: event.messageId,
        chat_id: event.chatId,
        sender_id: event.senderId
      }
    });

    const routerPayload = {
      root,
      transport: "feishu",
      sender: event.senderId,
      chat_id: event.chatId,
      message_id: event.messageId,
      text,
      context: [JSON.stringify(metadata)],
      metadata
    };

    const result = {
      routerMessage: await this.postRoute(
        this.config.harvis.routes.routerMessage,
        routerPayload,
        headers
      )
    };

    if (isMobileCodePayload(payload)) {
      const projection = buildAgentRoomProjection(payload, this.config, event);
      let topicId = projection.topic_id;
      if (!topicId) {
        const topicResult = await this.postRoute(
          this.config.harvis.routes.agentRoomTopic,
          {
            root,
            title: "MobileCode Runtime",
            goal: "Read-only MobileCode status and evidence bridge.",
            created_by: this.config.mobilecode.agentId
          },
          headers,
          { optional: true }
        );
        result.agentRoomTopic = topicResult;
        topicId = extractTopicId(topicResult);
      }

      result.agentRoomMessage = await this.postRoute(
        this.config.harvis.routes.agentRoomMessage,
        {
          root,
          topic_id: topicId,
          transport: "feishu",
          agent_id: this.config.mobilecode.agentId,
          role: "mobile-runtime",
          content: projection.message.content,
          source_refs: projection.message.source_refs,
          sensitivity: projection.message.sensitivity,
          metadata: redact({ ...metadata, agent_room_projection: projection })
        },
        headers,
        { optional: true }
      );

      if (projection.task_status.task_id) {
        const taskStatus = toHarvisTaskStatus(projection.task_status.status);
        const taskCreateResult = await this.postRoute(
          this.config.harvis.routes.taskCreate,
          {
            root,
            topic_id: topicId,
            title: taskTitle(projection),
            owner_slot_id: this.config.mobilecode.agentId,
            status: taskStatus,
            source_event_id: projection.event_id,
            approval_id: projection.display.approval?.approval_id,
            description: projection.message.content,
            metadata: redact({ ...metadata, agent_room_projection: projection })
          },
          headers,
          { optional: true }
        );
        result.taskCreate = taskCreateResult;
        const harvisTaskId = extractTaskId(taskCreateResult) || projection.task_status.task_id;
        result.taskStatus = await this.postRoute(
          this.config.harvis.routes.taskStatus,
          {
            root,
            task_id: harvisTaskId,
            status: taskStatus,
            note: projection.task_status.next_action || projection.message.content,
            metadata: redact({ ...metadata, agent_room_projection: projection })
          },
          headers,
          { optional: true }
        );
      }
    }

    return result;
  }

  async postRoute(route, body, headers, { optional = false } = {}) {
    if (!route) return { skipped: true, reason: "route_not_configured" };
    const url = route.startsWith("http") ? route : `${this.baseUrl}${route}`;
    try {
      const response = await withTimeout(
        this.fetchImpl(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        }),
        this.config.harvis.timeoutMs
      );
      const text = await response.text();
      let data = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text.slice(0, 1000);
      }
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      if (optional) {
        return { ok: false, optional: true, error: error.message };
      }
      throw error;
    }
  }

  async headers() {
    const headers = { "content-type": "application/json" };
    const token = await this.token();
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
  }

  async token() {
    const envName = this.config.harvis.tokenEnv;
    if (envName && process.env[envName]) return process.env[envName];
    const file = this.config.harvis.tokenFile;
    if (!file) return "";
    try {
      return (await readFile(file, "utf8")).trim();
    } catch {
      return "";
    }
  }
}

function extractTopicId(result) {
  if (!result?.ok) return "";
  return (
    result.data?.topic_id ||
    result.data?.data?.topic_id ||
    result.data?.data?.topic?.topic_id ||
    result.data?.data?.id ||
    ""
  );
}

function extractTaskId(result) {
  if (!result?.ok) return "";
  return result.data?.task_id || result.data?.data?.task_id || result.data?.data?.id || "";
}

function taskTitle(projection) {
  const externalTaskId = projection.task_status.task_id;
  const phase = projection.task_status.phase;
  return ["MobileCode", phase, externalTaskId].filter(Boolean).join(" ");
}

export function toHarvisTaskStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["pending", "queued", "created"].includes(normalized)) return "pending";
  if (["running", "in_progress", "processing", "reported"].includes(normalized)) {
    return "in_progress";
  }
  if (["waiting_approval", "needs_approval", "approval_required"].includes(normalized)) {
    return "waiting_approval";
  }
  if (["reviewing", "review"].includes(normalized)) return "reviewing";
  if (["verified", "passed", "success", "succeeded", "done", "complete", "completed"].includes(normalized)) {
    return "done";
  }
  if (["blocked", "failed", "failure", "error"].includes(normalized)) return "blocked";
  if (["cancelled", "canceled"].includes(normalized)) return "cancelled";
  return "in_progress";
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Harvis request timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
