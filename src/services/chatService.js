export class ChatService {
  constructor(provider) {
    this.provider = provider;
  }

  async send(messages) {
    return this.provider.chat(messages);
  }
}
