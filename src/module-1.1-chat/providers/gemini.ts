import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';
import { toGeminiSchema } from '../tool-schema';

type Params = { apiKey: string; model: string; messages: ChatMessage[]; systemPrompt: string; tools: McpTool[]; callTool: ToolCaller };

export async function runGeminiConversation(params: Params): Promise<ChatTurnResult> {
  if (!params.apiKey.trim()) return { reply: 'ยังไม่ได้ตั้งค่า Gemini API key กรุณาตั้งค่า GEMINI_API_KEY ก่อนใช้งาน', toolTrace: [] };
  const contents: Array<Record<string, unknown>> = params.messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }],
  }));
  const toolTrace: ToolTraceEntry[] = [];
  const tools = params.tools.length ? [{ functionDeclarations: params.tools.map((tool) => ({ name: `${tool.serverId}__${tool.name}`, description: tool.description, parameters: toGeminiSchema(tool.inputSchema) })) }] : undefined;
  for (let round = 0; round < 4; round += 1) {
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: params.systemPrompt }] }, contents, ...(tools ? { tools } : {}) }),
      });
    } catch {
      return { reply: 'เชื่อมต่อ Gemini ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตและลองใหม่', toolTrace };
    }
    if (!response.ok) return { reply: `เรียก Gemini ไม่สำเร็จ (${response.status}) กรุณาตรวจสอบการตั้งค่าและลองใหม่`, toolTrace };
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args?: unknown } }> } }> };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.flatMap((part) => part.functionCall ? [part.functionCall] : []);
    const text = parts.map((part) => part.text ?? '').join('');
    if (!calls.length) return { reply: text || 'โมเดลไม่ส่งข้อความตอบกลับ', toolTrace };
    contents.push({ role: 'model', parts });
    const functionResponses = [];
    for (const call of calls) {
      const [serverId, ...nameParts] = call.name.split('__'); const toolName = nameParts.join('__');
      try { const result = await params.callTool(serverId, toolName, call.args ?? {}); toolTrace.push({ serverId, toolName, arguments: call.args ?? {}, result }); functionResponses.push({ functionResponse: { name: call.name, response: { result } } }); }
      catch (error) { const message = error instanceof Error ? error.message : 'เรียก tool ไม่สำเร็จ'; toolTrace.push({ serverId, toolName, arguments: call.args ?? {}, error: message }); functionResponses.push({ functionResponse: { name: call.name, response: { error: message } } }); }
    }
    contents.push({ role: 'user', parts: functionResponses });
  }
  return { reply: 'การเรียกเครื่องมือใช้จำนวนรอบสูงสุดแล้ว กรุณาลองถามใหม่อีกครั้ง', toolTrace };
}