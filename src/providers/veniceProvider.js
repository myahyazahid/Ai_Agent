export class VeniceProvider {
  constructor(config = {}) {
    this.config = config;
  }

  async chat(_messages) {
    throw new Error("VeniceProvider.chat is not implemented yet.");
  }
}
