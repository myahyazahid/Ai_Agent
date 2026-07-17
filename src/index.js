// src/index.js

import readline from "node:readline";
import codingAgent from "./agents/codingAgent.js";
import eventBus, { AGENT_EVENTS } from "./core/eventBus.js";
import {
  renderChat,
  renderDoneEvent,
  renderError,
  renderExit,
  renderHeader,
  renderStatusEvent,
} from "./utils/cliRenderer.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

display(renderHeader());

const unsubscribe = subscribeToAgentEvents(eventBus);

rl.on("close", () => {
  unsubscribe();
});

/**
 * Print a formatted CLI message.
 *
 * @param {string} message
 * @param {"log" | "error"} [method]
 * @returns {void}
 */
function display(message, method = "log") {
  console[method](message);
}

/**
 * Subscribe the CLI to shared agent events.
 *
 * @param {import("./core/eventBus.js").AgentEventBus} executionEventBus
 * @returns {() => void}
 */
function subscribeToAgentEvents(executionEventBus) {
  /**
   * @param {{message?: string}} event
   * @returns {void}
   */
  const handleStatus = (event) => {
    const output = renderStatusEvent(event);

    if (output) {
      display(output);
    }
  };

  /**
   * @param {{source?: string, success?: boolean}} event
   * @returns {void}
   */
  const handleDone = (event) => {
    const output = renderDoneEvent(event);

    if (output) {
      display(output);
    }
  };

  executionEventBus.on(AGENT_EVENTS.STATUS, handleStatus);
  executionEventBus.on(AGENT_EVENTS.DONE, handleDone);

  return () => {
    executionEventBus.off(AGENT_EVENTS.STATUS, handleStatus);
    executionEventBus.off(AGENT_EVENTS.DONE, handleDone);
  };
}

/**
 * Run the interactive CLI loop.
 *
 * @returns {void}
 */
function chat() {
  rl.question("\nYou:\n", async (input) => {
    if (input.trim().toLowerCase() === "exit") {
      display(renderExit());
      rl.close();
      return;
    }

    try {
      const result = await codingAgent.chat(input);
      display(renderChat(result));
    } catch (error) {
      display(renderError(error), "error");
    }

    chat();
  });
}

chat();