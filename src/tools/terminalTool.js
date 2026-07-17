import Tool from "./Tool.js";

/**
 * Placeholder tool for future shell execution support.
 * The implementation is intentionally disabled until a command allowlist,
 * sandbox strategy, and audit trail are defined.
 */
export class TerminalTool extends Tool {
  /**
   * @param {object} [options]
   * @param {import("../core/eventBus.js").AgentEventBus | null} [options.eventBus]
   */
  constructor({ eventBus } = {}) {
    super({
      name: "terminal_execute",
      description: "Execute an allowlisted terminal command inside a controlled environment.",
      eventBus,
      schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute.",
          },
          cwd: {
            type: "string",
            description: "Working directory for the command.",
          },
        },
        required: ["command"],
      },
    });
  }

  /**
   * Placeholder execution hook for future terminal support.
   *
   * @param {object} args
   * @param {string} args.command
   * @param {string} [args.cwd]
   * @returns {Promise<object>}
   */
  async execute(args = {}) {
    this.emitStatus("Preparing terminal execution", {
      command: args.command ?? "",
    });
    this.emitDone({
      command: args.command ?? "",
      status: "not_implemented",
    });

    return {
      type: "tool_result",
      tool: this.name,
      success: false,
      message: "Terminal execution is intentionally disabled until a safe command policy is defined.",
      data: {
        stdout: "",
        stderr: "",
        exitCode: null,
      },
    };
  }
}

export default TerminalTool;
