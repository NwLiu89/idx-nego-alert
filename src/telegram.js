/** Delivery: one message per deal, via your own bot. */

import { withRetry } from './retry.js';

export async function sendMessage(text, { token, chatId, fetchImpl = fetch, retries = 2, backoffMs = 1000 } = {}) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID is not set');

  return withRetry(async () => {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      // The body usually explains the real problem ("chat not found", "bot was blocked").
      const detail = await res.text().catch(() => '');
      throw new Error(`Telegram sendMessage failed: HTTP ${res.status} ${detail}`.trim());
    }
    return res;
  }, { retries, backoffMs });
}
