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
  const message =
    typeof event?.message === "string" ? event.message.trim() : "";

  if (!message) {
    return "";
  }

  return `🧠 ${message}...`;
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
 * Render the full assistant turn for the CLI.
 *
 * @param {{thinking?: string, content?: string}} result
 * @returns {string}
 */
export function renderChat(result) {
  return `\n${SECTION_LINE}\n\n${renderResponse(result?.content ?? "")}`;
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
