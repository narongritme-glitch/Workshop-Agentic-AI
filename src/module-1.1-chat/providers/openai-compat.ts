import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';

type Params = { baseUrl: string; apiKey: string; model: string; messages: ChatMessage[]; systemPrompt: string; tools: McpTool[]; callTool: ToolCaller };
type ApiMessage = { role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string };

export async function runOpenAiCompatConversation(params: Params): Promise<ChatTurnResult> {
  if (!params.baseUrl.trim()) return { reply: 'ยังไม่ได้ตั้งค่า base URL ของ gateway กรุณาตั้งค่า OPENAI_COMPAT_BASE_URL ก่อนใช้งาน', toolTrace: [] };
  if (!params.apiKey.trim()) return { reply: 'ยังไม่ได้ตั้งค่า API key ของ provider นี้ กรุณาตั้งค่า API key ก่อนใช้งาน', toolTrace: [] };
  const messages: ApiMessage[] = [{ role: 'system', content: params.systemPrompt }, ...params.messages]; const trace: ToolTraceEntry[] = [];
  const tools = params.tools.map((tool) => ({ type: 'function', function: { name: `${tool.serverId}__${tool.name}`, description: tool.description, parameters: tool.inputSchema } }));
  const endpoint = `${params.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  for (let round = 0; round < 4; round += 1) {
    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${params.apiKey}` }, body: JSON.stringify({ model: params.model, messages, ...(tools.length ? { tools, tool_choice: 'auto' } : {}) }) });
    } catch {
      return { reply: 'เชื่อมต่อ AI provider ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตและลองใหม่', toolTrace: trace };
    }
    if (!response.ok) return { reply: `เรียก AI provider ไม่สำเร็จ (${response.status}) กรุณาตรวจสอบการตั้งค่าและลองใหม่`, toolTrace: trace };
    const data = await response.json() as { choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> };
    const message = data.choices?.[0]?.message; if (!message) return { reply: 'AI provider ไม่ส่งข้อความตอบกลับ', toolTrace: trace };
    if (!message.tool_calls?.length) return { reply: message.content ?? '', toolTrace: trace };
    messages.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls });
    for (const call of message.tool_calls) { const [serverId, ...parts] = call.function.name.split('__'); const toolName = parts.join('__'); let args: unknown = {}; try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* provider supplied invalid JSON */ }
      try { const result = await params.callTool(serverId, toolName, args); trace.push({ serverId, toolName, arguments: args, result }); messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) }); }
      catch (error) { const text = error instanceof Error ? error.message : 'เรียก tool ไม่สำเร็จ'; trace.push({ serverId, toolName, arguments: args, error: text }); messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: JSON.stringify({ error: text }) }); }
    }
  }
  return { reply: 'การเรียกเครื่องมือใช้จำนวนรอบสูงสุดแล้ว กรุณาลองถามใหม่อีกครั้ง', toolTrace: trace };
}