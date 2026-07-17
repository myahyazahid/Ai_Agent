import { ollamaConfig } from "../config/ollama.js";

export class LLMClient {
  constructor(config = ollamaConfig) {
    this.config = config;
  }
}
