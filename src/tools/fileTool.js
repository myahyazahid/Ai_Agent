import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Tool from "./tool.js";

/**
 * Tool for controlled file system access inside a workspace root.
 * Related operations are grouped under one tool so future file capabilities
 * can be added without changing registry or agent orchestration code.
 */
export class FileTool extends Tool {
  /**
   * @param {object} [options]
   * @param {string} [options.basePath]
   * @param {import("../core/eventBus.js").AgentEventBus | null} [options.eventBus]
   */
  constructor({ basePath = process.cwd(), eventBus } = {}) {
    super({
      name: "file",
      description: "Read and write UTF-8 files inside the configured workspace.",
      eventBus,
      schema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["read_file", "write_file"],
            description: "The file operation to perform.",
          },
          path: {
            type: "string",
            description: "Relative or absolute path to the target file.",
          },
          content: {
            type: "string",
            description: "Text content to write when operation is write_file.",
          },
          encoding: {
            type: "string",
            default: "utf8",
            description: "File encoding used for reading and writing.",
          },
        },
        required: ["operation", "path"],
      },
    });

    this.basePath = path.resolve(basePath);
  }

  /**
   * Execute a supported file operation.
   *
   * @param {object} args
   * @param {"read_file" | "write_file"} args.operation
   * @param {string} args.path
   * @param {string} [args.content]
   * @param {BufferEncoding} [args.encoding]
   * @returns {Promise<object>}
   */
  async execute(args = {}) {
    const { operation } = args;

    switch (operation) {
      case "read_file":
        return this.read_file(args);
      case "write_file":
        return this.write_file(args);
      default:
        throw new Error(`Unsupported file operation: ${operation}`);
    }
  }

  /**
   * Read a file from the configured workspace.
   *
   * @param {object} args
   * @param {string} args.path
   * @param {BufferEncoding} [args.encoding]
   * @returns {Promise<object>}
   */
  async read_file({ path: filePath, encoding = "utf8" } = {}) {
    if (!filePath || typeof filePath !== "string") {
      throw new TypeError("read_file requires a non-empty path string.");
    }

    const resolvedPath = this.resolvePath(filePath);
    this.emitStatus("Reading file", {
      operation: "read_file",
      path: resolvedPath,
    });
    const content = await readFile(resolvedPath, encoding);

    this.emitDone({
      operation: "read_file",
      path: resolvedPath,
    });

    return {
      tool: this.name,
      operation: "read_file",
      path: resolvedPath,
      content,
      encoding,
    };
  }

  /**
   * Write text content to a file inside the configured workspace.
   *
   * @param {object} args
   * @param {string} args.path
   * @param {string} args.content
   * @param {BufferEncoding} [args.encoding]
   * @returns {Promise<object>}
   */
  async write_file({ path: filePath, content, encoding = "utf8" } = {}) {
    if (!filePath || typeof filePath !== "string") {
      throw new TypeError("write_file requires a non-empty path string.");
    }

    if (typeof content !== "string") {
      throw new TypeError("write_file requires string content.");
    }

    const resolvedPath = this.resolvePath(filePath);
    this.emitStatus("Writing file", {
      operation: "write_file",
      path: resolvedPath,
    });

    await mkdir(path.dirname(resolvedPath), { recursive: true });
    await writeFile(resolvedPath, content, encoding);

    this.emitDone({
      operation: "write_file",
      path: resolvedPath,
    });

    return {
      tool: this.name,
      operation: "write_file",
      path: resolvedPath,
      bytesWritten: Buffer.byteLength(content, encoding),
      encoding,
    };
  }

  /**
   * Resolve and validate that a path stays within the configured workspace.
   *
   * @param {string} targetPath
   * @returns {string}
   */
  resolvePath(targetPath) {
    const resolvedPath = path.resolve(this.basePath, targetPath);
    const relativePath = path.relative(this.basePath, resolvedPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error("FileTool cannot access paths outside the configured workspace.");
    }

    return resolvedPath;
  }
}

export default FileTool;
