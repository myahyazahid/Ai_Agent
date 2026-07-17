import { LLMClient } from "../core/llm.js";
import { MemoryStore } from "../core/memory.js";

export function createCodingAgent() {
  return {
    llm: new LLMClient(),
    memory: new MemoryStore(),
  };
}
