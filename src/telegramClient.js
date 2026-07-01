import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_LIMIT = 4096;

let bot = null;

export function createClient(token) {
  bot = new TelegramBot(token);
  return bot;
}

export function waitForReady() {
  return Promise.resolve();
}

export async function sendToGroup(chatId, message) {
  if (message.length <= TELEGRAM_LIMIT) {
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    return;
  }

  const chunks = [];
  let current = '';
  for (const line of message.split('\n')) {
    if (current.length + line.length + 1 > TELEGRAM_LIMIT) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    await bot.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
  }
}
