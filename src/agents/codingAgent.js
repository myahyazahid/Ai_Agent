// src/agents/codingAgent.js

import promptBuilder from "../core/promptBuilder.js";
import memory from "../core/memory.js";
import llm from "../core/llm.js";
import eventBus from "../core/eventBus.js";

export class CodingAgent {
  /**
   * @param {object} [dependencies]
   * @param {typeof promptBuilder} [dependencies.promptBuilder]
   * @param {typeof memory} [dependencies.memory]
   * @param {typeof llm} [dependencies.llm]
   * @param {import("../core/eventBus.js").AgentEventBus} [dependencies.eventBus]
   */
  constructor({
    promptBuilder: promptBuilderService = promptBuilder,
    memory: memoryStore = memory,
    llm: llmClient = llm,
    eventBus: executionEventBus = eventBus,
  } = {}) {
    this.promptBuilder = promptBuilderService;
    this.memory = memoryStore;
    this.llm = llmClient;
    this.eventBus = executionEventBus;
    this.eventSource = "codingAgent";
  }

  /**
   * Build the prompt, call the model, and persist only the textual conversation
   * state needed for future turns.
   *
   * @param {string} userInput
   * @returns {Promise<{
   *   role: string,
   *   content: string,
   *   thinking: string,
   *   done: boolean,
   *   raw: Record<string, unknown>
   * }>}
   */
  async chat(userInput) {
    this.emitStatus("Understanding request");
    this.emitStatus("Planning");

    const messages = this.promptBuilder.build(userInput);

    this.emitStatus("Calling LLM");
    const responsePromise = this.llm.chat(messages);
    this.emitStatus("Waiting for response");

    const response = await responsePromise;

    this.memory.add("user", userInput);
    this.memory.add("assistant", response.content);
    this.emitDone({
      role: response.role,
      done: response.done,
    });

    return response;
  }

  /**
   * Emit an execution status update.
   *
   * @param {string} message
   * @param {Record<string, unknown>} [payload]
   * @returns {boolean}
   */
  emitStatus(message, payload = {}) {
    return this.eventBus.emitStatus(message, {
      source: this.eventSource,
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
    return this.eventBus.emitDone({
      source: this.eventSource,
      ...payload,
    });
  }
}

export default new CodingAgent();
