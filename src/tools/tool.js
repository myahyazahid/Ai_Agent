import eventBus from "../core/eventBus.js";

/**
 * Base abstraction for every agent tool.
 * Concrete tools must provide a stable name, human-readable description,
 * JSON-schema-like input contract, and an async execute implementation.
 */
export class Tool {
  /**
   * @param {object} config
   * @param {string} config.name
   * @param {string} config.description
   * @param {Record<string, unknown>} [config.schema]
   * @param {import("../core/eventBus.js").AgentEventBus | null} [config.eventBus]
   * @param {string} [config.eventSource]
   */
  constructor({
    name,
    description,
    schema = {},
    eventBus: toolEventBus = eventBus,
    eventSource = name,
  }) {
    if (!name || typeof name !== "string") {
      throw new TypeError("Tool name must be a non-empty string.");
    }

    if (!description || typeof description !== "string") {
      throw new TypeError("Tool description must be a non-empty string.");
    }

    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
      throw new TypeError("Tool schema must be an object.");
    }

    if (
      toolEventBus !== null &&
      (typeof toolEventBus !== "object" || typeof toolEventBus.emitEvent !== "function")
    ) {
      throw new TypeError("Tool eventBus must expose emitEvent(type, payload).");
    }

    this.name = name;
    this.description = description;
    this.schema = Object.freeze({ ...schema });
    this.eventBus = toolEventBus;
    this.eventSource = eventSource;
  }

  /**
   * Execute the tool with the given arguments.
   *
   * @param {Record<string, unknown>} _args
   * @returns {Promise<unknown>}
   */
  async execute(_args) {
    throw new Error(`Tool "${this.name}" must implement execute(args).`);
  }

  /**
   * Emit a status update to the shared event bus.
   *
   * @param {string} message
   * @param {Record<string, unknown>} [payload]
   * @returns {boolean}
   */
  emitStatus(message, payload = {}) {
    if (!this.eventBus) {
      return false;
    }

    return this.eventBus.emitStatus(message, {
      source: this.eventSource,
      ...payload,
    });
  }

  /**
   * Emit a completion event to the shared event bus.
   *
   * @param {Record<string, unknown>} [payload]
   * @returns {boolean}
   */
  emitDone(payload = {}) {
    if (!this.eventBus) {
      return false;
    }

    return this.eventBus.emitDone({
      source: this.eventSource,
      ...payload,
    });
  }
}

export default Tool;
