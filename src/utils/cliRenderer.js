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
 * Render an execution status event with iteration context.
 *
 * @param {{message?: string, phase?: string, tool?: string, args?: Record<string, unknown>, result?: Record<string, unknown>, iteration?: number, maxIterations?: number}} event
 * @returns {string}
 */
export function renderStatusEvent(event) {
  const iterationTag = formatIterationTag(event?.iteration, event?.maxIterations);

  switch (event?.phase) {
    case "planning":
      return "🧠 Planning...";
    case "llm":
      return `🤖 Deciding next action...${iterationTag}`;
    case "tool_selected":
      return `🔧 Tool: ${event.tool ?? "unknown_tool"}`;
    case "tool_executing":
      return renderToolExecutionEvent(event);
    case "tool_finished":
      return "✅ Success";
    case "tool_failed":
      return `❌ ${event?.result?.message ?? "Tool failed."}`;
    case "continuing":
      return `🤖 Continuing...${iterationTag}`;
    case "max_iterations":
      return "⚠️ Agent exceeded maximum execution steps.";

    // Workspace awareness phases
    case "workspace:scanning":
      return "📂 Scanning workspace...";
    case "workspace:analyzing":
      return "🔍 Analyzing project...";
    case "workspace:dependencies":
      return "📦 Reading dependencies...";
    case "workspace:entrypoint":
      return "🎯 Detecting entry point...";
    case "workspace:ready":
      return `✅ Workspace ready (${event?.totalFiles ?? "?"} files, ${event?.framework ?? "none"})`;
    case "workspace:cache-hit":
      return "💾 Using cached workspace data";
    case "workspace:cache-miss":
      return "🔄 Cache expired, rescanning...";
    case "workspace:cache-refresh":
      return "🔄 Refreshing workspace data...";

    // Context engine phases
    case "context:building":
      return "🧠 Context engine building...";
    case "context:selecting-files":
      return "🔍 Selecting relevant files...";
    case "context:resolving":
      return "🔍 Resolving file references...";
    case "context:ranking":
      return "📊 Scoring file relevance...";
    case "context:budget":
      return `⚖ Applying token budget (${event?.maxTokens ?? "?"} tokens)...`;
    case "context:ready": {
      const cacheTag = event?.cached ? " (cached)" : "";
      const selected = typeof event?.selectedFilesCount === "number" ? ` (${event.selectedFilesCount} files)` : "";
      return `✅ Context assembled${cacheTag}${selected}`;
    }
    case "context:cache-hit":
      return "💾 Using cached context";

    // Decision Engine phases
    case "decision:selecting":
      return "🤔 Selecting strategy...";
    case "decision:resolved": {
      const decision = event?.decision || {};
      const stratMap = {
        create_auth_scratch: "Create authentication from scratch",
        reuse_existing_auth: "Reuse existing authentication",
        integrate_nextauth: "Integrate with NextAuth",
        clarify: "Clarify request details",
        none: "Direct file modification"
      };
      const stratName = stratMap[decision.strategy] || decision.strategy || "None";
      const confPercent = Math.round((decision.confidence || 0) * 100);
      return [
        "📋 Decision:",
        `  Strategy: ${stratName}`,
        `  Reason: ${decision.reason || "No reason specified"}`,
        `  Confidence: ${confPercent}%`
      ].join("\n");
    }

    // Planner phases
    case "planner:analyzing":
      return "🧠 Analyzing task...";
    case "planner:inspecting":
      return "🔍 Inspecting project...";
    case "planner:detected": {
      const summary = event?.summary || {};
      const caps = summary.capabilities || {};
      const confPercent = Math.round(summary.confidence * 100);
      return [
        "📋 Detected:",
        `  Framework: ${summary.framework || "None"} (Confidence: ${confPercent}%)`,
        `  Authentication: ${caps.authentication || "None"}`,
        `  Database: ${caps.database || "None"}`,
        `  Entry: ${summary.entryPoint || "None"}`
      ].join("\n");
    }
    case "planner:planning":
      return "📝 Building execution plan...";
    case "planner:step": {
      const step = event?.step;
      const desc = step ? `: ${step.description}` : "";
      return `📦 Step ${iterationTag}${desc}`;
    }
    case "planner:completed":
      return "✅ Plan completed.";

    // Editing engine phases
    case "editing:reading":
      return "📖 Reading file...";
    case "editing:planning":
      return "🧠 Planning edits...";
    case "editing:patch":
      return "🩹 Generating patch...";
    case "editing:validating":
      return "🔍 Validating...";
    case "editing:writing":
      return "💾 Writing...";
    case "editing:done":
      return event?.preview ? "👀 Preview compiled (skipping write)" : "✅ Edit complete.";

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
 * Format an iteration progress tag like " [2/15]".
 *
 * @param {number | undefined} iteration
 * @param {number | undefined} maxIterations
 * @returns {string}
 */
function formatIterationTag(iteration, maxIterations) {
  if (typeof iteration !== "number") {
    return "";
  }

  if (typeof maxIterations === "number") {
    return ` [${iteration}/${maxIterations}]`;
  }

  return ` [${iteration}]`;
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
      return `📄 Creating: ${String(args.path ?? "(unknown path)")}`;
    case "append_file":
      return `📝 Updating: ${String(args.path ?? "(unknown path)")}`;
    case "read_file":
      return `📖 Reading: ${String(args.path ?? "(unknown path)")}`;
    case "delete_file":
      return `🗑 Deleting: ${String(args.path ?? "(unknown path)")}`;
    case "terminal_execute":
      return `💻 Executing: ${String(args.command ?? "(unknown command)")}`;
    default:
      return `🔧 Executing: ${tool}`;
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
      return `\n\nCreated: ${String(details.path ?? "(unknown path)")}`;
    case "append_file":
      return `\n\nModified: ${String(details.path ?? "(unknown path)")}`;
    case "read_file":
      return `\n\nRead: ${String(details.path ?? "(unknown path)")}`;
    case "delete_file":
      return `\n\nDeleted: ${String(details.path ?? "(unknown path)")}`;
    case "terminal_execute":
      return `\n\nExecuted: ${String(details.command ?? "(unknown command)")}`;
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
