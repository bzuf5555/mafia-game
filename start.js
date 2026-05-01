require('dotenv').config();
const { spawn } = require('child_process');

const isProduction = process.env.NODE_ENV === 'production';

async function main() {
  if (isProduction) {
    // Railway / cloud da tunnel kerak emas — real URL bor
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      console.error('❌  APP_URL muhit o\'zgaruvchisi yo\'q!');
      process.exit(1);
    }
    console.log(`🌐  Production URL: ${appUrl}`);
    require('./server');
  } else {
    // Local ishlab chiqish uchun tunnel ochish
    const fs = require('fs');
    const path = require('path');
    const localtunnel = require('localtunnel');
    const PORT = process.env.PORT || 3000;

    console.log('🌐  Tunnel ochilmoqda...');
    const tunnel = await localtunnel({ port: PORT, subdomain: 'mafia-game-uz' }).catch(() =>
      localtunnel({ port: PORT })
    );

    const appUrl = tunnel.url;
    console.log(`✅  App URL: ${appUrl}`);

    // .env ni yangilash
    let env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    env = env.replace(/^APP_URL=.*/m, `APP_URL=${appUrl}`);
    fs.writeFileSync(path.join(__dirname, '.env'), env);

    tunnel.on('close', () => { console.log('🔌  Tunnel yopildi'); process.exit(0); });

    const server = spawn('node', ['server.js'], {
      stdio: 'inherit',
      env: { ...process.env, APP_URL: appUrl }
    });
    server.on('close', () => { tunnel.close(); process.exit(0); });
    process.on('SIGINT', () => { tunnel.close(); server.kill(); });
  }
}

main().catch(err => {
  console.error('❌  Xato:', err.message);
  process.exit(1);
});
