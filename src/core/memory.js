// src/core/memory.js

/**
 * In-memory conversation store for the local agent runtime.
 */
export class Memory {
  constructor() {
    /** @type {Array<{role: string, content: string}>} */
    this.messages = [];
  }

  /**
   * Add a single message to memory.
   *
   * @param {string} role
   * @param {string} content
   * @returns {void}
   */
  add(role, content) {
    this.messages.push({
      role,
      content,
    });
  }

  /**
   * Add multiple messages to memory in order.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @returns {void}
   */
  addMany(messages) {
    for (const message of messages) {
      if (message?.role && typeof message.content === "string") {
        this.add(message.role, message.content);
      }
    }
  }

  /**
   * Get the current conversation history.
   *
   * @returns {Array<{role: string, content: string}>}
   */
  get() {
    return [...this.messages];
  }

  /**
   * Clear all stored messages.
   *
   * @returns {void}
   */
  clear() {
    this.messages = [];
  }
}

export default new Memory();
