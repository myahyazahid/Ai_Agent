import FileTool from "../tools/fileTool.js";
import TerminalTool from "../tools/terminalTool.js";
import { Tool } from "../tools/Tool.js";

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
   * Resolve a tool by name.
   *
   * @param {string} name
   * @returns {Tool | undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * Check whether a tool is registered.
   *
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * List every registered tool.
   *
   * @returns {Tool[]}
   */
  list() {
    return Array.from(this.tools.values());
  }
}

/**
 * Build the default registry used by the local agent runtime.
 *
 * @param {object} [options]
 * @param {string} [options.basePath]
 * @returns {ToolRegistry}
 */
export function createDefaultToolRegistry({ basePath = process.cwd() } = {}) {
  const registry = new ToolRegistry();

  registry.register(
    new FileTool({
      name: "read_file",
      description: "Read a UTF-8 text file from the workspace.",
      operation: "read_file",
      basePath,
    })
  );
  registry.register(
    new FileTool({
      name: "write_file",
      description: "Create or overwrite a UTF-8 text file in the workspace.",
      operation: "write_file",
      basePath,
    })
  );
  registry.register(
    new FileTool({
      name: "append_file",
      description: "Append UTF-8 text to an existing or new workspace file.",
      operation: "append_file",
      basePath,
    })
  );
  registry.register(
    new FileTool({
      name: "delete_file",
      description: "Delete a file from the workspace.",
      operation: "delete_file",
      basePath,
    })
  );
  registry.register(new TerminalTool());

  return registry;
}

const toolRegistry = createDefaultToolRegistry();

export default toolRegistry;
