import { ollamaConfig } from "../config/ollama.js";

export class OllamaProvider {
  constructor(config = ollamaConfig) {
    this.config = config;
  }

  async chat(_messages) {
    throw new Error("OllamaProvider.chat is not implemented yet.");
  }
}
