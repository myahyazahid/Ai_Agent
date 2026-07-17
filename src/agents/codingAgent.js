// src/agents/codingAgent.js

import promptBuilder from "../core/promptBuilder.js";
import memory from "../core/memory.js";
import llm from "../core/llm.js";
import eventBus from "../core/eventBus.js";
import toolParser from "../core/toolParser.js";
import toolRegistry from "../registry/toolRegistry.js";
import workspaceContext from "../core/workspaceContext.js";

const DEFAULT_MAX_ITERATIONS = 15;

export class CodingAgent {
  /**
   * @param {object} [dependencies]
   * @param {typeof promptBuilder} [dependencies.promptBuilder]
   * @param {typeof memory} [dependencies.memory]
   * @param {typeof llm} [dependencies.llm]
   * @param {typeof toolParser} [dependencies.toolParser]
   * @param {typeof toolRegistry} [dependencies.toolRegistry]
   * @param {typeof workspaceContext} [dependencies.workspaceContext]
   * @param {import("../core/eventBus.js").AgentEventBus} [dependencies.eventBus]
   * @param {number} [dependencies.maxIterations]
   */
  constructor({
    promptBuilder: promptBuilderService = promptBuilder,
    memory: memoryStore = memory,
    llm: llmClient = llm,
    toolParser: responseToolParser = toolParser,
    toolRegistry: registeredTools = toolRegistry,
    workspaceContext: workspaceContextBuilder = workspaceContext,
    eventBus: executionEventBus = eventBus,
    maxIterations = DEFAULT_MAX_ITERATIONS,
  } = {}) {
    this.promptBuilder = promptBuilderService;
    this.memory = memoryStore;
    this.llm = llmClient;
    this.toolParser = responseToolParser;
    this.toolRegistry = registeredTools;
    this.workspaceContext = workspaceContextBuilder;
    this.eventBus = executionEventBus;
    this.eventSource = "codingAgent";
    this.maxIterations = maxIterations;
  }

  /**
   * Run a multi-step agent loop until the model returns a final response or the
   * iteration budget is exhausted.
   *
   * @param {string} userInput
   * @returns {Promise<
   *   | {
   *       type: "response",
   *       role: string,
   *       content: string,
   *       thinking: string,
   *       done: boolean,
   *       raw: Record<string, unknown>,
   *       iterations: number,
   *       toolResults: Array<{
   *         type: "tool_result",
   *         tool: string,
   *         success: boolean,
   *         message: string,
   *         data: Record<string, unknown> | null
   *       }>
   *     }
   *   | {
   *       type: "agent_error",
   *       success: false,
   *       message: string,
   *       iterations: number,
   *       toolResults: Array<{
   *         type: "tool_result",
   *         tool: string,
   *         success: boolean,
   *         message: string,
   *         data: Record<string, unknown> | null
   *       }>
   *     }
   * >}
   */
  async chat(userInput) {
    this.emitStatus("Understanding request");
    this.emitStatus("Planning", { phase: "planning" });

    const history = this.memory.get();
    const context = this.workspaceContext.build({
      userInput,
      history,
    });
    const messages = this.promptBuilder.build(userInput, history, context);
    const newMemoryMessages = [{ role: "user", content: userInput }];
    const toolResults = [];

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      const response = await this.requestModel(messages, iteration);
      const parsed = this.toolParser.parse(response.content);

      if (parsed.type === "response") {
        const finalContent = parsed.content;

        newMemoryMessages.push({
          role: response.role,
          content: finalContent,
        });
        this.persistMemoryMessages(newMemoryMessages);
        this.emitDone({
          role: response.role,
          done: response.done,
          iterations: iteration,
          toolCount: toolResults.length,
          success: true,
        });

        return {
          type: "response",
          role: response.role,
          content: finalContent,
          thinking: response.thinking,
          done: response.done,
          raw: response.raw,
          iterations: iteration,
          toolResults,
        };
      }

      const assistantToolCallMessage = this.createAssistantMessage(response.content);
      messages.push(assistantToolCallMessage);
      newMemoryMessages.push(assistantToolCallMessage);

      const toolResult = await this.executeToolCall(parsed, iteration);
      const toolMessage = this.createToolMessage(toolResult);

      toolResults.push(toolResult);
      messages.push(toolMessage);
      newMemoryMessages.push(toolMessage);

      this.emitStatus("Continuing", {
        phase: "continuing",
        iteration,
        tool: parsed.tool,
      });
    }

    const errorResult = {
      type: "agent_error",
      success: false,
      message: "Agent exceeded maximum execution steps.",
      iterations: this.maxIterations,
      toolResults,
    };

    newMemoryMessages.push(
      this.createAssistantMessage(errorResult.message)
    );
    this.persistMemoryMessages(newMemoryMessages);
    this.emitStatus(errorResult.message, { phase: "max_iterations" });
    this.emitDone({
      done: false,
      success: false,
      iterations: this.maxIterations,
      toolCount: toolResults.length,
    });

    return errorResult;
  }

  /**
   * Request the next action from the model.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {number} iteration
   * @returns {Promise<{
   *   role: string,
   *   content: string,
   *   thinking: string,
   *   done: boolean,
   *   raw: Record<string, unknown>
   * }>}
   */
  async requestModel(messages, iteration) {
    this.emitStatus("Deciding next action", {
      phase: "llm",
      iteration,
    });

    return this.llm.chat(messages);
  }

  /**
   * Resolve and execute a parsed tool call, then return a normalized tool result.
   *
   * @param {{type: "tool_call", tool: string, args: Record<string, unknown>}} parsed
   * @param {number} iteration
   * @returns {{
   *   type: "tool_result",
   *   tool: string,
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }}
   */
  async executeToolCall(parsed, iteration) {
    this.emitStatus("Tool Selected", {
      phase: "tool_selected",
      tool: parsed.tool,
      args: parsed.args,
      iteration,
    });

    if (!this.toolRegistry.has(parsed.tool)) {
      const result = this.createToolResult(
        parsed.tool,
        false,
        `Tool '${parsed.tool}' not found.`
      );

      this.emitStatus("Tool Failed", {
        phase: "tool_failed",
        tool: parsed.tool,
        args: parsed.args,
        iteration,
        result,
      });

      return result;
    }

    const tool = this.toolRegistry.get(parsed.tool);

    this.emitStatus("Executing Tool", {
      phase: "tool_executing",
      tool: parsed.tool,
      args: parsed.args,
      iteration,
    });

    try {
      const rawResult = await tool.execute(parsed.args);
      const normalizedResult = this.normalizeToolResult(parsed.tool, rawResult);

      this.emitStatus(
        normalizedResult.success ? "Tool Finished" : "Tool Failed",
        {
          phase: normalizedResult.success ? "tool_finished" : "tool_failed",
          tool: parsed.tool,
          args: parsed.args,
          iteration,
          result: normalizedResult,
        }
      );

      return normalizedResult;
    } catch (error) {
      const result = this.createToolResult(
        parsed.tool,
        false,
        error instanceof Error ? error.message : "Tool execution failed."
      );

      this.emitStatus("Tool Failed", {
        phase: "tool_failed",
        tool: parsed.tool,
        args: parsed.args,
        iteration,
        result,
      });

      return result;
    }
  }

  /**
   * Normalize any tool return value to the shared tool-result schema.
   *
   * @param {string} toolName
   * @param {unknown} rawResult
   * @returns {{
   *   type: "tool_result",
   *   tool: string,
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }}
   */
  normalizeToolResult(toolName, rawResult) {
    if (!rawResult || typeof rawResult !== "object" || Array.isArray(rawResult)) {
      return this.createToolResult(toolName, false, "Tool returned an invalid result.");
    }

    const result = /** @type {Record<string, unknown>} */ (rawResult);

    return this.createToolResult(
      typeof result.tool === "string" ? result.tool : toolName,
      result.success === true,
      typeof result.message === "string"
        ? result.message
        : "Tool execution completed.",
      result.data && typeof result.data === "object" && !Array.isArray(result.data)
        ? { ...result.data }
        : null
    );
  }

  /**
   * Create a standard structured tool result.
   *
   * @param {string} tool
   * @param {boolean} success
   * @param {string} message
   * @param {Record<string, unknown> | null} [data]
   * @returns {{
   *   type: "tool_result",
   *   tool: string,
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }}
   */
  createToolResult(tool, success, message, data = null) {
    return {
      type: "tool_result",
      tool,
      success,
      message,
      data,
    };
  }

  /**
   * Create an assistant message object.
   *
   * @param {string} content
   * @returns {{role: string, content: string}}
   */
  createAssistantMessage(content) {
    return {
      role: "assistant",
      content,
    };
  }

  /**
   * Convert a tool result into a message that the model can inspect in the next loop.
   *
   * @param {{
   *   type: "tool_result",
   *   tool: string,
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }} toolResult
   * @returns {{role: string, content: string}}
   */
  createToolMessage(toolResult) {
    return {
      role: "tool",
      content: JSON.stringify(toolResult, null, 2),
    };
  }

  /**
   * Persist the new execution messages into shared memory.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @returns {void}
   */
  persistMemoryMessages(messages) {
    this.memory.addMany(messages);
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
