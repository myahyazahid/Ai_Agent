/**
 * Parse model output into either a tool call or a plain response.
 * Parsing is intentionally tolerant so malformed output degrades gracefully
 * into a normal assistant response instead of breaking agent execution.
 */
export class ToolParser {
  /**
   * @param {string} text
   * @returns {{
   *   type: "tool_call",
   *   tool: string,
   *   args: Record<string, unknown>
   * } | {
   *   type: "response",
   *   content: string
   * }}
   */
  parse(text) {
    const originalText = typeof text === "string" ? text : "";
    const candidate = this.unwrapCodeFence(originalText).trim();

    if (!candidate) {
      return {
        type: "response",
        content: originalText,
      };
    }

    try {
      const parsed = JSON.parse(candidate);
      return this.normalizeParsedValue(parsed, originalText);
    } catch {
      return {
        type: "response",
        content: originalText,
      };
    }
  }

  /**
   * Remove a surrounding fenced code block when present.
   *
   * @param {string} text
   * @returns {string}
   */
  unwrapCodeFence(text) {
    const trimmed = text.trim();

    if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) {
      return text;
    }

    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  /**
   * Normalize parsed JSON into a supported tool-call or response shape.
   *
   * @param {unknown} parsed
   * @param {string} fallback
   * @returns {{
   *   type: "tool_call",
   *   tool: string,
   *   args: Record<string, unknown>
   * } | {
   *   type: "response",
   *   content: string
   * }}
   */
  normalizeParsedValue(parsed, fallback) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        type: "response",
        content: fallback,
      };
    }

    if (
      parsed.type === "tool_call" &&
      typeof parsed.tool === "string" &&
      parsed.tool.trim()
    ) {
      return {
        type: "tool_call",
        tool: parsed.tool.trim(),
        args: this.normalizeArgs(parsed.args),
      };
    }

    if (parsed.type === "response" && typeof parsed.content === "string") {
      return {
        type: "response",
        content: parsed.content,
      };
    }

    return {
      type: "response",
      content: fallback,
    };
  }

  /**
   * Ensure tool arguments are always a plain object.
   *
   * @param {unknown} args
   * @returns {Record<string, unknown>}
   */
  normalizeArgs(args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return {};
    }

    return { ...args };
  }
}

export default new ToolParser();
