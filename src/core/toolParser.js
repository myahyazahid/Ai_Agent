/**
 * Parse model output into either a tool call or a plain response.
 *
 * The parser enforces the single-action protocol: if the model returns
 * multiple JSON objects in one response (a violation), only the first
 * valid object is extracted and used. This prevents silent tool-call loss.
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
        type: "invalid_format",
        content: originalText,
      };
    }

    const jsonString = this.extractFirstJsonObject(candidate);

    if (!jsonString) {
      return {
        type: "invalid_format",
        content: originalText,
      };
    }

    try {
      const parsed = JSON.parse(jsonString);
      return this.normalizeParsedValue(parsed, originalText);
    } catch {
      return {
        type: "invalid_format",
        content: originalText,
      };
    }
  }

  /**
   * Extract the first top-level JSON object from a string that may contain
   * multiple concatenated objects, surrounding text, or markdown.
   *
   * Uses brace-depth tracking to find the boundaries of the first `{...}`
   * block, correctly handling nested braces and quoted strings.
   *
   * @param {string} text
   * @returns {string | null}
   */
  extractFirstJsonObject(text) {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        if (inString) {
          escapeNext = true;
        }
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        if (depth === 0) {
          start = i;
        }
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          return text.slice(start, i + 1);
        }
      }
    }

    return null;
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
        type: "invalid_format",
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
      type: "invalid_format",
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
