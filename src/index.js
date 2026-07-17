// src/index.js

import readline from "node:readline";
import codingAgent from "./agents/codingAgent.js";
import eventBus, { AGENT_EVENTS } from "./core/eventBus.js";
import editCache from "./editing/editCache.js";
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

    const command = input.trim().toLowerCase();

    if (command === "editplan" || command === "/editplan") {
      const lastEdit = editCache.getLastEdit();
      if (!lastEdit) {
        display("No edits have been executed yet in this session.");
      } else {
        display("\n📊 Last Edit Plan Summary:");
        display(`Target File: ${lastEdit.originalFile}`);
        display(`Editing Strategy: ${lastEdit.editPlan.strategy}`);
        if (lastEdit.editPlan.targetPattern) {
          display(`Target Pattern: "${lastEdit.editPlan.targetPattern}"`);
        }
        display(`Patch Size: ${lastEdit.patch.insertedCode.length} characters inserted, ${lastEdit.patch.removedCode.length} characters removed`);
        display(`Validation Result: ${lastEdit.validation.valid ? "✅ Valid" : "❌ Invalid"}`);
        if (lastEdit.validation.warnings.length > 0) {
          display(`Warnings:\n${lastEdit.validation.warnings.map(w => `  - ${w}`).join("\n")}`);
        }
        if (lastEdit.validation.errors.length > 0) {
          display(`Errors:\n${lastEdit.validation.errors.map(e => `  - ${e}`).join("\n")}`);
        }
      }
      chat();
      return;
    }

    if (command === "diff" || command === "/diff") {
      const lastEdit = editCache.getLastEdit();
      if (!lastEdit) {
        display("No edits have been executed yet in this session.");
      } else {
        display("\n🔎 Last Edit Diff:");
        display(lastEdit.diff);
      }
      chat();
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
// Test Editing Engine