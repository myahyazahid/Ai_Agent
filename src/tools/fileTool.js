import { appendFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import Tool from "./Tool.js";

/**
 * Tool for controlled file system access inside a workspace root.
 * Each instance represents a single named tool operation that can be registered
 * independently while sharing common file safety logic.
 */
export class FileTool extends Tool {
  /**
   * @param {object} [options]
   * @param {string} options.name
   * @param {string} options.description
   * @param {"read_file" | "write_file" | "append_file" | "delete_file"} options.operation
   * @param {string} [options.basePath]
   * @param {import("../core/eventBus.js").AgentEventBus | null} [options.eventBus]
   */
  constructor({
    name,
    description,
    operation,
    basePath = process.cwd(),
    eventBus,
  }) {
    const schema = FileTool.createSchema(operation);

    super({
      name,
      description,
      eventBus,
      schema,
    });

    this.operation = operation;
    this.basePath = path.resolve(basePath);
    this.handlers = {
      read_file: (args) => this.readFile(args),
      write_file: (args) => this.writeFile(args),
      append_file: (args) => this.appendFile(args),
      delete_file: (args) => this.deleteFile(args),
    };
  }

  /**
   * Build the schema for a specific file operation.
   *
   * @param {"read_file" | "write_file" | "append_file" | "delete_file"} operation
   * @returns {Record<string, unknown>}
   */
  static createSchema(operation) {
    const baseProperties = {
      path: {
        type: "string",
        description: "Relative or absolute path to the target file.",
      },
      encoding: {
        type: "string",
        default: "utf8",
        description: "File encoding used for reading and writing text files.",
      },
    };

    if (operation === "read_file" || operation === "delete_file") {
      return {
        type: "object",
        properties: baseProperties,
        required: ["path"],
      };
    }

    return {
      type: "object",
      properties: {
        ...baseProperties,
        content: {
          type: "string",
          description: "Text content to write into the file.",
        },
      },
      required: ["path", "content"],
    };
  }

  /**
   * Execute the configured file operation.
   *
   * @param {object} args
   * @returns {Promise<{
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }>}
   */
  async execute(args = {}) {
    const handler = this.handlers[this.operation];

    if (!handler) {
      return this.createResult(false, `Unsupported file operation: ${this.operation}`);
    }

    try {
      return await handler(args);
    } catch (error) {
      return this.createFailureResult(error);
    }
  }

  /**
   * Read a file from the configured workspace.
   *
   * @param {object} args
   * @param {string} args.path
   * @param {BufferEncoding} [args.encoding]
   * @returns {Promise<{
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }>}
   */
  async readFile({ path: filePath, encoding = "utf8" } = {}) {
    const resolvedPath = this.resolvePath(filePath);
    this.emitStatus("Reading file", { tool: this.name, path: resolvedPath });
    const content = await readFile(resolvedPath, encoding);
    this.emitDone({ tool: this.name, path: resolvedPath });

    return this.createResult(true, `File read successfully: ${resolvedPath}`, {
      path: resolvedPath,
      content,
      encoding,
    });
  }

  /**
   * Write text content to a file inside the configured workspace.
   *
   * @param {object} args
   * @param {string} args.path
   * @param {string} args.content
   * @param {BufferEncoding} [args.encoding]
   * @returns {Promise<{
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }>}
   */
  async writeFile({ path: filePath, content, encoding = "utf8" } = {}) {
    this.validateTextWriteArgs(filePath, content, "write_file");
    const resolvedPath = this.resolvePath(filePath);
    this.emitStatus("Writing file", { tool: this.name, path: resolvedPath });

    await mkdir(path.dirname(resolvedPath), { recursive: true });
    await writeFile(resolvedPath, content, encoding);
    this.emitDone({ tool: this.name, path: resolvedPath });

    return this.createResult(true, `File written successfully: ${resolvedPath}`, {
      path: resolvedPath,
      bytesWritten: Buffer.byteLength(content, encoding),
      encoding,
    });
  }

  /**
   * Append text content to a file inside the configured workspace.
   *
   * @param {object} args
   * @param {string} args.path
   * @param {string} args.content
   * @param {BufferEncoding} [args.encoding]
   * @returns {Promise<{
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }>}
   */
  async appendFile({ path: filePath, content, encoding = "utf8" } = {}) {
    this.validateTextWriteArgs(filePath, content, "append_file");
    const resolvedPath = this.resolvePath(filePath);
    this.emitStatus("Appending file", { tool: this.name, path: resolvedPath });

    await mkdir(path.dirname(resolvedPath), { recursive: true });
    await appendFile(resolvedPath, content, encoding);
    this.emitDone({ tool: this.name, path: resolvedPath });

    return this.createResult(true, `File appended successfully: ${resolvedPath}`, {
      path: resolvedPath,
      bytesWritten: Buffer.byteLength(content, encoding),
      encoding,
    });
  }

  /**
   * Delete a file from the configured workspace.
   *
   * @param {object} args
   * @param {string} args.path
   * @returns {Promise<{
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }>}
   */
  async deleteFile({ path: filePath } = {}) {
    const resolvedPath = this.resolvePath(filePath);
    this.emitStatus("Deleting file", { tool: this.name, path: resolvedPath });

    await unlink(resolvedPath);
    this.emitDone({ tool: this.name, path: resolvedPath });

    return this.createResult(true, `File deleted successfully: ${resolvedPath}`, {
      path: resolvedPath,
    });
  }

  /**
   * Validate write and append arguments.
   *
   * @param {string} filePath
   * @param {string} content
   * @param {"write_file" | "append_file"} operation
   * @returns {void}
   */
  validateTextWriteArgs(filePath, content, operation) {
    this.validatePath(filePath, operation);

    if (typeof content !== "string") {
      throw new TypeError(`${operation} requires string content.`);
    }
  }

  /**
   * Validate that a path argument exists and is usable.
   *
   * @param {string} filePath
   * @param {string} operation
   * @returns {void}
   */
  validatePath(filePath, operation) {
    if (!filePath || typeof filePath !== "string") {
      throw new TypeError(`${operation} requires a non-empty path string.`);
    }
  }

  /**
   * Create a standard tool result payload.
   *
   * @param {boolean} success
   * @param {string} message
   * @param {Record<string, unknown> | null} [data]
   * @returns {{
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }}
   */
  createResult(success, message, data = null) {
    return {
      type: "tool_result",
      tool: this.name,
      success,
      message,
      data,
    };
  }

  /**
   * Convert thrown errors into a standard tool result payload.
   *
   * @param {unknown} error
   * @returns {{
   *   success: false,
   *   message: string,
   *   data: null
   * }}
   */
  createFailureResult(error) {
    return this.createResult(
      false,
      error instanceof Error ? error.message : "File operation failed."
    );
  }

  /**
   * Resolve and validate that a path stays within the configured workspace.
   *
   * @param {string} targetPath
   * @returns {string}
   */
  resolvePath(targetPath) {
    this.validatePath(targetPath, this.operation);
    const resolvedPath = path.resolve(this.basePath, targetPath);
    const relativePath = path.relative(this.basePath, resolvedPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error("FileTool cannot access paths outside the configured workspace.");
    }

    return resolvedPath;
  }
}

export default FileTool;
