import { createCodingAgent } from "./agents/codingAgent.js";

export function main() {
  return createCodingAgent();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
