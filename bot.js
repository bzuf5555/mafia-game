require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token  = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL;

if (!token || token.includes('bu_yerga')) {
  console.error('❌  .env faylida BOT_TOKEN yo\'q!');
  process.exit(1);
}
if (!appUrl || appUrl.includes('bu_yerga')) {
  console.error('❌  .env faylida APP_URL yo\'q!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('🤖  Telegram bot ishga tushdi...');

// /start — asosiy xabar + o'yin tugmasi
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name   = msg.from.first_name || 'O\'yinchi';

  bot.sendMessage(chatId,
    `Salom, *${name}*\\! 🎭\n\n` +
    `*Mafia — Shahar vs Mafia* o'yiniga xush kelibsiz\\!\n\n` +
    `Qoidalar:\n` +
    `🔴 *Mafia* — kechasi fuqarolarni yo'q qiladi\n` +
    `🔵 *Doktor* — har kecha kimnidir himoya qiladi\n` +
    `🟡 *Sheriff* — har kecha kimnidir tekshiradi\n` +
    `⚪ *Fuqaro* — mantiq va ovoz berish orqali g'alaba\n\n` +
    `Quyidagi tugmani bosib o'yinni boshlang\\:`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🎮  O\'yinni boshlash',
            web_app: { url: appUrl }
          }
        ]]
      }
    }
  );
});

// /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🎭 *Mafia o'yini qoidalari*\n\n` +
    `*KUN bosqichi:*\n` +
    `• Barcha o'yinchilar muhokama qiladi\n` +
    `• Ovoz berish orqali bir kishini chiqaradi\n` +
    `• Chiqarilgan kishining roli oshkor bo'ladi\n\n` +
    `*TUN bosqichi:*\n` +
    `• 🔴 Mafia — qurbon tanlaydi\n` +
    `• 🔵 Doktor — birini davolaydi\n` +
    `• 🟡 Sheriff — birini tekshiradi\n\n` +
    `*G'alaba sharti:*\n` +
    `• Shahar: barcha Mafiyani yo'q qilsa\n` +
    `• Mafia: fuqarolar soni tenglaşса`,
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

// /play — to'g'ridan-to'g'ri o'yin
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

// Noma'lum xabar
bot.on('message', (msg) => {
  if (msg.text?.startsWith('/')) return;
  bot.sendMessage(msg.chat.id,
    'O\'yin boshlash uchun /start yozing yoki quyidagi tugmani bosing 👇',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮  O\'ynash', web_app: { url: appUrl } }
        ]]
      }
    }
  );
});

// Web App ma'lumot qabul qilish (ixtiyoriy — kelajak uchun)
bot.on('web_app_data', (msg) => {
  try {
    const data = JSON.parse(msg.web_app_data.data);
    console.log('Web App data:', data);
  } catch (_) {}
});

module.exports = bot;
