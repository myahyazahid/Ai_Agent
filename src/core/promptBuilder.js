export function buildPrompt(systemPrompt, userPrompt) {
  return [systemPrompt, userPrompt].filter(Boolean).join("\n\n");
}
