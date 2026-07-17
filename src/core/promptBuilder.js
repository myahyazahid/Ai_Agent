// src/core/promptBuilder.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import memory from "./memory.js";

class PromptBuilder {

    build(userMessage) {
      const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

        const systemPrompt = fs.readFileSync(
            path.join(__dirname, "../prompts/systemPrompt.txt"),
            "utf8"
        );

        return [
            {
                role: "system",
                content: systemPrompt
            },

            ...memory.get(),

            {
                role: "user",
                content: userMessage
            }

        ];

    }

}

export default new PromptBuilder();