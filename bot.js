require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token  = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL;

if (!token || token.includes('bu_yerga')) {
  console.error('❌  BOT_TOKEN yo\'q!');
  process.exit(1);
}
if (!appUrl || appUrl.includes('bu_yerga')) {
  console.error('❌  APP_URL yo\'q!');
  process.exit(1);
}

// Webhook mode — polling yo'q, 409 conflict bo'lmaydi
const bot = new TelegramBot(token, { polling: false });

// Webhook URL ni ro'yxatdan o'tkazish
const webhookUrl = `${appUrl}/tg-webhook`;
bot.setWebHook(webhookUrl).then(() => {
  console.log(`🔗  Webhook: ${webhookUrl}`);
}).catch(err => {
  console.error('Webhook xato:', err.message);
});

console.log('🤖  Telegram bot (webhook) ishga tushdi...');

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name   = msg.from.first_name || 'O\'yinchi';

  bot.sendMessage(chatId,
    `Salom, *${name}*\\! 🎭\n\n` +
    `*Mafia — Shahar vs Mafia* o'yiniga xush kelibsiz\\!\n\n` +
    `🔴 *Mafia* — kechasi fuqarolarni yo'q qiladi\n` +
    `🔵 *Doktor* — har kecha kimnidir himoya qiladi\n` +
    `🟡 *Sheriff* — har kecha kimnidir tekshiradi\n` +
    `⚪ *Fuqaro* — mantiq va ovoz berish orqali g'alaba\n\n` +
    `Quyidagi tugmani bosib o'yinni boshlang\\:`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮  O\'yinni boshlash', web_app: { url: appUrl } }
        ]]
      }
    }
  );
});

// /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🎭 *Mafia o'yini qoidalari*\n\n` +
    `*KUN bosqichi:*\n• Muhokama → Ovoz berish → Chiqarish\n\n` +
    `*TUN bosqichi:*\n• 🔴 Mafia qurbon tanlaydi\n• 🔵 Doktor himoya qiladi\n• 🟡 Sheriff tekshiradi\n\n` +
    `*G'alaba:*\n• Shahar: barcha Mafiyani topsa\n• Mafia: soni tenglashsa`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮  O\'yin boshlash', web_app: { url: appUrl } }
        ]]
      }
    }
  );
});

// /play
bot.onText(/\/play/, (msg) => {
  bot.sendMessage(msg.chat.id, '🎲 O\'yin ekrani ochilmoqda\\.\\.\\.', {
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '🎮  O\'ynash', web_app: { url: appUrl } }
      ]]
    }
  });
});

// Boshqa xabarlar
bot.on('message', (msg) => {
  if (msg.text?.startsWith('/')) return;
  if (msg.web_app_data) return;
  bot.sendMessage(msg.chat.id,
    'O\'yin boshlash uchun /start yozing 👇',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮  O\'ynash', web_app: { url: appUrl } }
        ]]
      }
    }
  );
});

module.exports = bot;
