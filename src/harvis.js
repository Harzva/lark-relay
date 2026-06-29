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
      result.agentRoomMessage = await this.postRoute(
        this.config.harvis.routes.agentRoomMessage,
        {
          root,
          transport: "feishu",
          agent_id: this.config.mobilecode.agentId,
          role: "mobile-runtime",
          content: projection.message.content,
          metadata: redact({ ...metadata, agent_room_projection: projection })
        },
        headers,
        { optional: true }
      );

      if (projection.task_status.task_id) {
        result.taskStatus = await this.postRoute(
          this.config.harvis.routes.taskStatus,
          {
            root,
            task_id: projection.task_status.task_id,
            status: projection.task_status.status,
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
