export class MemoryStore {
  constructor() {
    this.messages = [];
  }

  add(message) {
    this.messages.push(message);
  }
}
