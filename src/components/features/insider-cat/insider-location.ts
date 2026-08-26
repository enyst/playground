/**
 * Map the current Canvas path to a one-line phrase the voice cat can be told,
 * so "continue this" / "what's here" make sense. Kept tiny and pure — the goal
 * is only an accurate "you're on X" hint, not a full route model.
 */
export function describeLocation(pathname: string): string {
  const rules: [RegExp, string][] = [
    [/\/conversations\/[^/]+/, "a conversation is open"],
    [/^\/(conversations)?$/, "the home / new-chat page"],
    [/^\/skin/, "the Secretary board"],
    [/^\/customize/, "the Customize / extensions page"],
    [/^\/skills/, "the Skills settings"],
    [/^\/plugins/, "the Plugins settings"],
    [/^\/mcp/, "the MCP settings"],
    [/^\/settings\/llm/, "the LLM settings page"],
    [/^\/settings\/agents/, "the Agent Profiles settings"],
    [/^\/settings/, "the settings"],
  ];
  for (const [re, label] of rules) {
    if (re.test(pathname)) return label;
  }
  return `the page at ${pathname}`;
}
