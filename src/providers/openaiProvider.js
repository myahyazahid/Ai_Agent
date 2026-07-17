export class OpenAIProvider {
  constructor(config = {}) {
    this.config = config;
  }

  async chat(_messages) {
    throw new Error("OpenAIProvider.chat is not implemented yet.");
  }
}
