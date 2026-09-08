const history = [];
const messages = document.querySelector('#messages');
const form = document.querySelector('#form'); const input = document.querySelector('#message');
const provider = document.querySelector('#provider'); const model = document.querySelector('#model');
const defaults = { gemini: 'gemini-flash-latest', openai: 'gpt-4o-mini', 'openai-compat': 'gpt-4o-mini' };
provider.addEventListener('change', () => { model.value = defaults[provider.value] || ''; });
function addBubble(role, text) { const el = document.createElement('div'); el.className = `bubble ${role}`; el.textContent = text; messages.append(el); messages.scrollTop = messages.scrollHeight; }
form.addEventListener('submit', async (event) => { event.preventDefault(); const text = input.value.trim(); if (!text) return; input.value = ''; addBubble('user', text); history.push({ role: 'user', content: text }); const button = form.querySelector('button'); button.disabled = true;
  try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, history: history.slice(0, -1), provider: provider.value, model: model.value }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด'); addBubble('assistant', data.reply || 'ไม่มีคำตอบ'); history.push({ role: 'assistant', content: data.reply || '' }); } catch (error) { addBubble('assistant', error.message || 'เชื่อมต่อไม่สำเร็จ'); } finally { button.disabled = false; input.focus(); }
});