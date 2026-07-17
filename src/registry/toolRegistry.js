import { Tool } from "../tools/tool.js";

/**
 * Registry responsible for storing and resolving tool instances by name.
 * Tools are treated as replaceable plugins, which keeps agent orchestration
 * decoupled from concrete implementations.
 */
export class ToolRegistry {
  constructor() {
    /** @type {Map<string, Tool>} */
    this.tools = new Map();
  }

  /**
   * Register a tool instance.
   *
   * @param {Tool} tool
   * @returns {Tool}
   */
  register(tool) {
    if (!(tool instanceof Tool)) {
      throw new TypeError("Only Tool instances can be registered.");
    }

    this.tools.set(tool.name, tool);
    return tool;
  }

  /**
   * Remove a tool by name.
   *
   * @param {string} name
   * @returns {boolean}
   */
  unregister(name) {
    return this.tools.delete(name);
  }

  /**
   * Resolve a tool by name.
   *
   * @param {string} name
   * @returns {Tool | undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * List every registered tool.
   *
   * @returns {Tool[]}
   */
  getAll() {
    return Array.from(this.tools.values());
  }
}

export default ToolRegistry;
