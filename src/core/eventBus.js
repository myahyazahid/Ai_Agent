import { EventEmitter } from "node:events";

export const AGENT_EVENTS = Object.freeze({
  STATUS: "status",
  DONE: "done",
});

/**
 * Shared event bus for agent execution updates.
 * The bus is UI-agnostic so the same events can be consumed by the CLI,
 * a VS Code extension, or a web application.
 */
export class AgentEventBus extends EventEmitter {
  /**
   * Emit a typed event with common metadata.
   *
   * @param {string} type
   * @param {Record<string, unknown>} [payload]
   * @returns {boolean}
   */
  emitEvent(type, payload = {}) {
    return this.emit(type, {
      type,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  }

  /**
   * Emit a status update for in-progress work.
   *
   * @param {string} message
   * @param {Record<string, unknown>} [payload]
   * @returns {boolean}
   */
  emitStatus(message, payload = {}) {
    return this.emitEvent(AGENT_EVENTS.STATUS, {
      message,
      ...payload,
    });
  }

  /**
   * Emit a completion event.
   *
   * @param {Record<string, unknown>} [payload]
   * @returns {boolean}
   */
  emitDone(payload = {}) {
    return this.emitEvent(AGENT_EVENTS.DONE, payload);
  }
}

const eventBus = new AgentEventBus();

export default eventBus;
