import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { HarvisClient } from "./harvis.js";
import { sendReply, spawnEventConsumer } from "./lark.js";
import {
  buildReplyText,
  normalizeLarkEvent,
  parseRelayPayload,
  redact,
  shouldProcessEvent
} from "./payloads.js";

export class Relay {
  constructor(config, options = {}) {
    this.config = config;
    this.harvis = options.harvisClient || new HarvisClient(config, options);
    this.replyRunner = options.replyRunner;
    this.logger = options.logger || console;
    this.statePath = resolve(config.state.file);
    this.evidenceDir = resolve(config.state.evidenceDir);
    this.state = { processedEventIds: [] };
  }

  async loadState() {
    try {
      const raw = await readFile(this.statePath, "utf8");
      const decoded = JSON.parse(raw);
      this.state = {
        processedEventIds: Array.isArray(decoded.processedEventIds)
          ? decoded.processedEventIds
          : []
      };
    } catch {
      this.state = { processedEventIds: [] };
    }
  }

  async saveState() {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(
      this.statePath,
      `${JSON.stringify({ ...this.state, updatedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8"
    );
  }

  hasProcessed(eventId) {
    return this.state.processedEventIds.includes(eventId);
  }

  async markProcessed(eventId) {
    const ids = this.state.processedEventIds.filter((id) => id !== eventId);
    ids.push(eventId);
    this.state.processedEventIds = ids.slice(-this.config.state.maxProcessedEvents);
    await this.saveState();
  }

  async routeRawEvent(rawEvent, { reply = true } = {}) {
    const event = normalizeLarkEvent(rawEvent);
    const baseEvidence = {
      schema: "lark-relay.evidence.v1",
      event: redact(event),
      timestamp: new Date().toISOString()
    };

    if (this.hasProcessed(event.eventId)) {
      return this.writeEvidence({
        ...baseEvidence,
        skipped: true,
        failureKind: "duplicate_event",
        nextAction: "wait_for_new_event"
      });
    }

    const decision = shouldProcessEvent(event, this.config);
    if (!decision.ok) {
      return this.writeEvidence({
        ...baseEvidence,
        skipped: true,
        failureKind: decision.reason,
        nextAction: "wait_for_matching_event"
      });
    }

    let payload;
    try {
      payload = parseRelayPayload(decision.text, this.config);
    } catch (error) {
      return this.writeEvidence({
        ...baseEvidence,
        skipped: false,
        failureKind: "payload_invalid",
        error: error.message,
        nextAction: "fix_payload_schema"
      });
    }

    let harvisResult;
    try {
      harvisResult = await this.harvis.route(event, payload);
    } catch (error) {
      return this.writeEvidence({
        ...baseEvidence,
        payload: redact(payload),
        failureKind: "harvis_route_failed",
        error: error.message,
        nextAction: "check_harvis_local_api"
      });
    }

    let replyResult = { skipped: true };
    if (reply) {
      const replyText = buildReplyText(payload, this.config, harvisResult);
      replyResult = await sendReply(this.config, {
        messageId: event.messageId,
        text: replyText,
        runner: this.replyRunner
      });
    }

    await this.markProcessed(event.eventId);
    return this.writeEvidence({
      ...baseEvidence,
      payload: redact(payload),
      harvisResult: redact(harvisResult),
      replyResult: redact(replyResult),
      failureKind: replyResult.ok === false ? "lark_reply_failed" : "none",
      nextAction: replyResult.ok === false ? "inspect_lark_reply_scope" : "routed"
    });
  }

  async writeEvidence(evidence) {
    await mkdir(this.evidenceDir, { recursive: true });
    const line = `${JSON.stringify(evidence)}\n`;
    const daily = join(this.evidenceDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    await appendFile(daily, line, "utf8");
    return evidence;
  }

  async run({ once = false, maxEvents = 0, timeout = "60s" } = {}) {
    await this.loadState();
    let processed = 0;
    return new Promise((resolve, reject) => {
      const child = spawnEventConsumer(
        this.config,
        {
          onEventLine: (line) => {
            this.routeRawEvent(line)
              .then((evidence) => {
                processed += evidence.skipped ? 0 : 1;
                this.logger.log(
                  `[lark-relay] event=${evidence.event.eventId} failure=${evidence.failureKind}`
                );
                if (once || (maxEvents > 0 && processed >= maxEvents)) child.kill("SIGTERM");
              })
              .catch((error) => {
                this.logger.error(`[lark-relay] route failed: ${error.stack || error}`);
              });
          },
          onStderr: (chunk) => {
            if (chunk.includes("[event] ready")) this.logger.log("[lark-relay] Lark consumer ready");
            else this.logger.error(chunk.trim());
          },
          onError: reject,
          onExit: (code, signal) => {
            if (code === 0 || signal === "SIGTERM") resolve({ code, signal, processed });
            else reject(new Error(`Lark event consumer exited code=${code} signal=${signal}`));
          }
        },
        { maxEvents, timeout }
      );
    });
  }
}
