export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type ChatProvider = 'gemini' | 'openai' | 'openai-compat';

export type McpTool = {
  serverId: string;
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

export type ToolTraceEntry = {
  serverId: string;
  toolName: string;
  arguments: unknown;
  result?: unknown;
  error?: string;
};

export type ToolCaller = (serverId: string, toolName: string, args: unknown) => Promise<unknown>;
export type ChatTurnResult = { reply: string; toolTrace: ToolTraceEntry[] };

export function toolFunctionName(serverId: string, toolName: string): string {
  return `${serverId}__${toolName}`;
}