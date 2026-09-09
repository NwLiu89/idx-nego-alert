#!/usr/bin/env node
/**
 * One-off setup helper: prints the chat id to use as TELEGRAM_CHAT_ID.
 *
 *   1. Create a bot with @BotFather in Telegram, copy the token it gives you.
 *   2. Open your new bot and press Start (or send it any message).
 *   3. TELEGRAM_BOT_TOKEN=<token> node scripts/get-chat-id.js
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Set TELEGRAM_BOT_TOKEN first, e.g.\n  TELEGRAM_BOT_TOKEN=123:abc node scripts/get-chat-id.js');
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const body = await res.json();

if (!body.ok) {
  console.error(`Telegram rejected the token: ${body.description ?? res.status}`);
  process.exit(1);
}

const chats = new Map();
for (const update of body.result ?? []) {
  const chat = (update.message ?? update.channel_post ?? update.my_chat_member)?.chat;
  if (chat) chats.set(chat.id, chat);
}

if (chats.size === 0) {
  console.error('No messages yet. Open your bot in Telegram, press Start, then run this again.');
  console.error('(Telegram only keeps recent updates, so send a fresh message if it has been a while.)');
  process.exit(1);
}

console.log('Add the id below as the TELEGRAM_CHAT_ID repository secret:\n');
for (const chat of chats.values()) {
  const who = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ') ?? chat.username;
  console.log(`  ${chat.id}\t(${chat.type}: ${who})`);
}
