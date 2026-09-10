#!/usr/bin/env node
/**
 * Setup diagnostic: says which bot TELEGRAM_BOT_TOKEN belongs to, and which chats have
 * messaged it. Run it from the telegram-whoami workflow so the token stays in GitHub.
 *
 * Prints ids and usernames only - never the token, so the run log is safe to read.
 *
 *   TELEGRAM_BOT_TOKEN=<token> node scripts/telegram-whoami.js
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set.');
  process.exit(1);
}

async function call(method) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`);
  const body = await res.json().catch(() => ({}));
  // 401 means the token itself is wrong; anything else is a per-method problem.
  if (!body.ok) throw new Error(`${method}: HTTP ${res.status} ${body.description ?? ''}`.trim());
  return body.result;
}

let me;
try {
  me = await call('getMe');
} catch (err) {
  console.error(String(err.message));
  console.error('A 401 here means the TELEGRAM_BOT_TOKEN secret is wrong or the bot was deleted;');
  console.error('get a fresh token from @BotFather (/mybots -> your bot -> API Token).');
  process.exit(1);
}
console.log(`Bot: @${me.username}  (id ${me.id}, name "${me.first_name}")`);
console.log('This is the ONLY bot that can deliver these alerts. Open @' + me.username + ' in Telegram.\n');

let updates;
try {
  updates = await call('getUpdates');
} catch (err) {
  // A webhook takes ownership of updates and makes getUpdates return 409.
  console.error(String(err.message));
  console.error('If that is a 409, a webhook is set on this bot and getUpdates cannot be used.');
  process.exit(1);
}

const chats = new Map();
for (const update of updates ?? []) {
  const chat = (update.message ?? update.channel_post ?? update.my_chat_member)?.chat;
  if (chat) chats.set(chat.id, chat);
}

if (chats.size === 0) {
  console.error(`No one has messaged @${me.username} recently.`);
  console.error('Open it in Telegram, press Start, then re-run this workflow.');
  console.error('(Telegram only retains recent updates, so send a fresh message if it has been a while.)');
  process.exit(1);
}

console.log('Candidate TELEGRAM_CHAT_ID values:\n');
for (const chat of chats.values()) {
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
  const who = chat.title ?? (name || chat.username || '?');
  console.log(`  ${chat.id}\t(${chat.type}: ${who})`);
}

// --send-test proves the token and chat id work together end to end, which is the only
// thing that distinguishes a fixed setup from a plausible-looking one.
if (process.argv.includes('--send-test')) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.error('\nTELEGRAM_CHAT_ID is not set, so there is nothing to test.');
    process.exit(1);
  }
  const { sendMessage } = await import('../src/telegram.js');
  console.log(`\nSending a test message to chat ${chatId} ...`);
  await sendMessage('<b>IDX Nego Alert</b>\nSetup test - delivery is working.', {
    token,
    chatId,
    retries: 0,
  });
  console.log('Sent. Check Telegram.');
}
