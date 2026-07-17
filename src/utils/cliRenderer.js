const HEADER_LINE = "=".repeat(50);
const SECTION_LINE = "\u2500".repeat(36);

/**
 * Render the application header.
 *
 * @returns {string}
 */
export function renderHeader() {
  return `${HEADER_LINE}\n🤖 Antigravity AI\n${HEADER_LINE}`;
}

/**
 * Render an execution status event.
 *
 * @param {{message?: string}} event
 * @returns {string}
 */
export function renderStatusEvent(event) {
  switch (event?.phase) {
    case "planning":
      return "🧠 Planning...";
    case "llm":
      return "🤖 Deciding next action...";
    case "tool_selected":
      return `🔧 Selected Tool:\n${event.tool ?? "unknown_tool"}`;
    case "tool_executing":
      return renderToolExecutionEvent(event);
    case "tool_finished":
      return "✅ Success";
    case "tool_failed":
      return `❌ ${event?.result?.message ?? "Tool failed."}`;
    case "continuing":
      return "🤖 Continuing...";
    case "max_iterations":
      return "⚠️ Agent exceeded maximum execution steps.";
    default: {
      const message =
        typeof event?.message === "string" ? event.message.trim() : "";

      if (!message) {
        return "";
      }

      return `🧠 ${message}...`;
    }
  }
}

/**
 * Render the completion event for the overall agent run.
 *
 * @param {{source?: string, success?: boolean}} event
 * @returns {string}
 */
export function renderDoneEvent(event) {
  if (event?.source !== "codingAgent") {
    return "";
  }

  if (event.success === false) {
    return "";
  }

  return "✔ Task completed.";
}

/**
 * Render the native Ollama thinking section.
 * This is kept for future UI targets, but the CLI does not use it for now.
 *
 * @param {string} thinking
 * @returns {string}
 */
export function renderThinking(thinking) {
  const normalizedThinking = typeof thinking === "string" ? thinking.trim() : "";

  if (!normalizedThinking) {
    return "";
  }

  return `🧠 Model Thinking\n\n${normalizedThinking}`;
}

/**
 * Render the assistant response section.
 *
 * @param {string} content
 * @returns {string}
 */
export function renderResponse(content) {
  const normalizedContent = typeof content === "string" ? content.trim() : "";
  return `🤖 Response\n\n${normalizedContent || "(No response content returned.)"}`;
}

/**
 * Render a tool execution result block.
 *
 * @param {{
 *   tool: string,
 *   result: {
 *     success: boolean,
 *     message: string,
 *     data: Record<string, unknown> | null
 *   }
 * }} result
 * @returns {string}
 */
export function renderToolResult(result) {
  const toolName = typeof result?.tool === "string" ? result.tool : "unknown_tool";
  const normalizedResult =
    result?.result && typeof result.result === "object" ? result.result : result;
  const statusLabel = normalizedResult?.success ? "Success" : "Failed";
  const message =
    typeof normalizedResult?.message === "string"
      ? normalizedResult.message
      : "Tool execution finished.";
  const details = renderToolResultDetails(toolName, normalizedResult?.data);

  return `🛠 Tool Result\n\nTool: ${toolName}\nStatus: ${statusLabel}\nMessage: ${message}${details}`;
}

/**
 * Render the full assistant turn for the CLI.
 *
 * @param {object} result
 * @returns {string}
 */
export function renderChat(result) {
  if (result?.type === "agent_error") {
    return `\n${SECTION_LINE}\n\n⚠️ Agent Error\n\n${result.message}`;
  }

  const body =
    result?.type === "tool_result"
      ? renderToolResult(result)
      : renderResponse(result?.content ?? "");

  return `\n${SECTION_LINE}\n\n${body}`;
}

/**
 * Render a friendly execution action for a tool event.
 *
 * @param {{tool?: string, args?: Record<string, unknown>}} event
 * @returns {string}
 */
function renderToolExecutionEvent(event) {
  const tool = typeof event?.tool === "string" ? event.tool : "unknown_tool";
  const args =
    event?.args && typeof event.args === "object" && !Array.isArray(event.args)
      ? event.args
      : {};

  switch (tool) {
    case "write_file":
      return `📄 Creating:\n${String(args.path ?? "(unknown path)")}`;
    case "append_file":
      return `📝 Updating:\n${String(args.path ?? "(unknown path)")}`;
    case "read_file":
      return `📖 Reading:\n${String(args.path ?? "(unknown path)")}`;
    case "delete_file":
      return `🗑 Deleting:\n${String(args.path ?? "(unknown path)")}`;
    case "terminal_execute":
      return `💻 Executing:\n${String(args.command ?? "(unknown command)")}`;
    default:
      return `🔧 Executing:\n${tool}`;
  }
}

/**
 * Render friendly tool result details.
 *
 * @param {string} tool
 * @param {unknown} data
 * @returns {string}
 */
function renderToolResultDetails(tool, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "";
  }

  const details = /** @type {Record<string, unknown>} */ (data);

  switch (tool) {
    case "write_file":
      return `\n\nCreated:\n${String(details.path ?? "(unknown path)")}`;
    case "append_file":
      return `\n\nModified:\n${String(details.path ?? "(unknown path)")}`;
    case "read_file":
      return `\n\nRead:\n${String(details.path ?? "(unknown path)")}`;
    case "delete_file":
      return `\n\nDeleted:\n${String(details.path ?? "(unknown path)")}`;
    case "terminal_execute":
      return `\n\nExecuted:\n${String(details.command ?? "(unknown command)")}`;
    default:
      return `\n\nData\n\n${JSON.stringify(details, null, 2)}`;
  }
}

/**
 * Render a friendly error block.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function renderError(error) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Something went wrong. Please try again.";

  return `\n${SECTION_LINE}\n\n⚠️ Error\n\n${message}`;
}

/**
 * Render the shutdown message.
 *
 * @returns {string}
 */
export function renderExit() {
  return "\nGoodbye!";
}
