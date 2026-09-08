import type { Env } from '../../env';
import { errorJson, json } from '../../lib/http';
import { runGeminiConversation } from './providers/gemini';
import { runOpenAiCompatConversation } from './providers/openai-compat';
import type { ChatMessage, ChatProvider, McpTool, ToolCaller } from './types';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export function resolveProvider(value: unknown, env: Env): ChatProvider {
  const requested = typeof value === 'string' ? value : env.DEFAULT_CHAT_PROVIDER;
  return requested === 'openai' || requested === 'openai-compat' ? requested : 'gemini';
}

export function defaultModelFor(provider: ChatProvider, env: Env): string {
  if (provider === 'gemini') return env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
  if (provider === 'openai') return env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  return env.OPENAI_COMPAT_MODEL?.trim() || 'gpt-4o-mini';
}

export function buildSystemPrompt(hasTools: boolean): string {
  return `คุณคือผู้ช่วย AI ภาษาไทยที่สุภาพและกระชับ${hasTools ? ' หากมีเครื่องมือ ให้ใช้เมื่อจำเป็นและสรุปผลให้ผู้ใช้เข้าใจง่าย' : ''}`;
}

export async function resolveApiKey(env: Env, provider: ChatProvider): Promise<string> {
  if (provider === 'gemini') return env.GEMINI_API_KEY?.trim() || '';
  if (provider === 'openai') return env.OPENAI_API_KEY?.trim() || '';
  return env.OPENAI_COMPAT_API_KEY?.trim() || '';
}

export async function resolveBaseUrl(env: Env, provider: ChatProvider): Promise<string> {
  return provider === 'openai' ? OPENAI_BASE_URL : (env.OPENAI_COMPAT_BASE_URL?.trim() === 'Replace base url' ? '' : env.OPENAI_COMPAT_BASE_URL?.trim() || '');
}

export async function resolveTools(_env: Env): Promise<{ tools: McpTool[]; callTool: ToolCaller }> {
  return { tools: [], callTool: async () => { throw new Error('ยังไม่มี tool ในโมดูลนี้'); } };
}

export async function runChatTurn(params: { env: Env; provider: ChatProvider; model?: string; history: ChatMessage[] }): Promise<{ reply: string; toolTraceCount: number }> {
  const provider = resolveProvider(params.provider, params.env); const model = params.model?.trim() || defaultModelFor(provider, params.env);
  const [apiKey, baseUrl, toolSet] = await Promise.all([resolveApiKey(params.env, provider), resolveBaseUrl(params.env, provider), resolveTools(params.env)]);
  const result = await runProvider(provider, { history: params.history, tools: toolSet.tools, apiKey, baseUrl, model, systemPrompt: buildSystemPrompt(toolSet.tools.length > 0), callTool: toolSet.callTool });
  return { reply: result.reply, toolTraceCount: result.toolTrace.length };
}

async function runProvider(provider: ChatProvider, params: { history: ChatMessage[]; tools: McpTool[]; apiKey: string; baseUrl: string; model: string; systemPrompt: string; callTool: ToolCaller }) {
  if (provider === 'gemini') return runGeminiConversation({ apiKey: params.apiKey, model: params.model, messages: params.history, systemPrompt: params.systemPrompt, tools: params.tools, callTool: params.callTool });
  return runOpenAiCompatConversation({ baseUrl: params.baseUrl, apiKey: params.apiKey, model: params.model, messages: params.history, systemPrompt: params.systemPrompt, tools: params.tools, callTool: params.callTool });
}

export async function handleChatRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('รองรับเฉพาะ POST สำหรับเส้นทางนี้', 405);
  try {
    const body = await request.json() as { message?: unknown; history?: unknown; provider?: unknown; model?: unknown };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return errorJson('กรุณาระบุ message', 400);
    const provider = resolveProvider(body.provider, env); const history: ChatMessage[] = Array.isArray(body.history) ? body.history.filter((item): item is ChatMessage => !!item && typeof item === 'object' && ((item as ChatMessage).role === 'user' || (item as ChatMessage).role === 'assistant') && typeof (item as ChatMessage).content === 'string').slice(-40) : [];
    history.push({ role: 'user', content: message });
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : defaultModelFor(provider, env);
    const [apiKey, baseUrl, toolSet] = await Promise.all([resolveApiKey(env, provider), resolveBaseUrl(env, provider), resolveTools(env)]);
    const result = await runProvider(provider, { history, tools: toolSet.tools, apiKey, baseUrl, model, systemPrompt: buildSystemPrompt(toolSet.tools.length > 0), callTool: toolSet.callTool });
    return json({ reply: result.reply, provider, model, toolTrace: result.toolTrace });
  } catch { return errorJson('รูปแบบคำขอไม่ถูกต้อง กรุณาส่ง JSON ที่มี message', 400); }
}