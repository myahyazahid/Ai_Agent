import axios from "axios";
import config from "../config/ollama.js";

class LLM {
  /**
   * Send a chat request to Ollama and return a structured assistant message.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @returns {Promise<{
   *   role: string,
   *   content: string,
   *   thinking: string,
   *   done: boolean,
   *   raw: Record<string, unknown>
   * }>}
   */
  async chat(messages) {
    try {
      const response = await axios.post(
        `${config.host}/api/chat`,
        {
          model: config.model,
          messages,
          stream: config.stream,
          options: {
            temperature: config.temperature,
          },
        }
      );

      return this.normalizeResponse(response.data);
    } catch (error) {
      throw this.createChatError(error);
    }
  }

  /**
   * Normalize the native Ollama response into a stable shape while preserving
   * the raw provider payload for future tool-calling workflows.
   *
   * @param {Record<string, unknown>} raw
   * @returns {{
   *   role: string,
   *   content: string,
   *   thinking: string,
   *   done: boolean,
   *   raw: Record<string, unknown>
   * }}
   */
  normalizeResponse(raw) {
    const message = raw?.message ?? {};

    return {
      role: typeof message.role === "string" ? message.role : "assistant",
      content: typeof message.content === "string" ? message.content : "",
      thinking: typeof message.thinking === "string" ? message.thinking : "",
      done: typeof raw?.done === "boolean" ? raw.done : true,
      raw,
    };
  }

  /**
   * Convert provider and transport failures into friendly application errors.
   *
   * @param {unknown} error
   * @returns {Error}
   */
  createChatError(error) {
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNREFUSED" || error.code === "ECONNABORTED") {
        return new Error(
          "Unable to reach Ollama. Make sure Ollama is running and accessible."
        );
      }

      if (error.response?.status === 404) {
        return new Error(
          `The Ollama model "${config.model}" was not found. Pull the model first and try again.`
        );
      }

      if (typeof error.response?.data?.error === "string") {
        return new Error(`Ollama error: ${error.response.data.error}`);
      }

      return new Error("The model request failed. Please try again.");
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error("An unexpected error occurred while talking to Ollama.");
  }
}

export default new LLM();
