// src/core/memory.js

class Memory {

    constructor() {
        this.messages = [];
    }

    add(role, content) {
        this.messages.push({
            role,
            content
        });
    }

    get() {
        return this.messages;
    }

    clear() {
        this.messages = [];
    }

}

export default new Memory();