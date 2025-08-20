// netlify/functions/bot.js

// Menggunakan require untuk mengimpor modul di Node.js.
const fetch = require('node-fetch');
const { Telegraf } = require('telegraf');

// Log ini akan muncul di log Netlify Functions jika fungsi berhasil dimulai.
console.log('Bot Telegram Node.js dimulai dan siap!');

// --- KONFIGURASI ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const NETLIFY_ACCESS_TOKEN = process.env.NETLIFY_ACCESS_TOKEN;
const NETLIFY_API_URL = 'https://api.netlify.com/api/v1';

// DAFTAR APLIKASI YANG DIIZINKAN DENGAN KONFIGURASI SUPABASE MEREKA
// Ini adalah map yang menghubungkan nama aplikasi Netlify dengan nama Environment Variable Supabase-nya.
// Anda HARUS MENGATUR Environment Variables ini di Netlify:
// Contoh: SUPABASE_URL_TELEGRAM_BOT, SUPABASE_SERVICE_ROLE_KEY_TELEGRAM_BOT
const APP_SUPABASE_CONFIG = {
  "telegram-akses-bot": { // Ini nama situs Netlify Anda
    supabaseUrlEnv: "SUPABASE_URL_TELEGRAM_BOT",
    supabaseKeyEnv: "SUPABASE_SERVICE_ROLE_KEY_TELEGRAM_BOT"
  },
  "rosette-studio": { // Contoh: nama situs Netlify lainnya
    supabaseUrlEnv: "SUPABASE_URL_ROSETTE_STUDIO",
    supabaseKeyEnv: "SUPABASE_SERVICE_ROLE_KEY_ROSETTE_STUDIO"
  },
  "apollostudio": { // Contoh: nama situs Netlify lainnya
    supabaseUrlEnv: "SUPABASE_URL_APOLLOSTUDIO",
    supabaseKeyEnv: "SUPABASE_SERVICE_ROLE_KEY_APOLLOSTUDIO"
  },
  // Tambahkan entri lain di sini untuk setiap aplikasi yang ingin Anda kelola
  // "nama-aplikasi-anda-yang-lain": {
  //   supabaseUrlEnv: "SUPABASE_URL_NAMA_APLIKASI_ANDA_YANG_LAIN",
  //   supabaseKeyEnv: "SUPABASE_SERVICE_ROLE_KEY_NAMA_APLIKASI_ANDA_YANG_LAIN"
  // },
};

// Memastikan Environment Variables penting untuk bot diatur.
if (!TELEGRAM_BOT_TOKEN || !NETLIFY_ACCESS_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN atau NETLIFY_ACCESS_TOKEN tidak diatur.');
  return {
    statusCode: 500,
    body: JSON.stringify({ message: 'Konfigurasi server tidak lengkap.' }),
  };
}

// Inisialisasi instance Telegraf
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// --- FUNGSI UNTUK MEMANGGIL NETLIFY FUNCTIONS LAIN ---

/**
 * Memanggil fungsi Netlify 'get-access-code' untuk mengambil kode akses.
 * Mengirim kredensial Supabase spesifik untuk aplikasi yang dipilih.
 */
async function getAccessCodeFromFunction(supabaseUrl, supabaseKey) {
  const functionUrl = `https://telegram-akses-bot.netlify.app/.netlify/functions/get-access-code`;
  try {
    const response = await fetch(functionUrl, {
      method: 'POST', // Menggunakan POST untuk mengirim data sensitif di body
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseUrl, supabaseKey }) // Kirim kredensial di body
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gagal mengambil kode dari get-access-code function:', response.status, errorData);
      return null;
    }
    const data = await response.json();
    return data.accessCode;
  } catch (error) {
    console.error('Error saat memanggil get-access-code function:', error);
    return null;
  }
}

/**
 * Memanggil fungsi Netlify 'mark-code-used' untuk menandai kode akses.
 * Mengirim kredensial Supabase spesifik untuk aplikasi yang dipilih.
 */
async function markAccessCodeUsed(code, supabaseUrl, supabaseKey) {
  const functionUrl = `https://telegram-akses-bot.netlify.app/.netlify/functions/mark-code-used`;
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessCode: code, supabaseUrl, supabaseKey }), // Kirim kredensial & kode
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gagal menandai kode dari mark-code-used function:', response.status, errorData);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error saat memanggil mark-code-used function:', error);
    return false;
  }
}

// --- HANDLER UPDATE TELEGRAM ---

bot.start(async (ctx) => {
  console.log('Menerima perintah /start dari', ctx.from.id);
  await ctx.reply('Selamat datang! Mengambil daftar aplikasi Anda dari Netlify...');

  try {
    const apps = await fetchNetlifyApps();
    if (apps && apps.length > 0) {
      const allowedAppNames = Object.keys(APP_SUPABASE_CONFIG);
      const filteredApps = apps.filter(app => allowedAppNames.includes(app.name));

      if (filteredApps.length > 0) {
        const keyboard = filteredApps.map((app) => [{ text: app.name, callback_data: `app_${app.id}` }]);
        await ctx.reply(
          'Silakan pilih aplikasi Netlify Anda:',
          { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'HTML' }
        );
      } else {
        await ctx.reply('Tidak ada aplikasi yang diizinkan ditemukan atau terjadi kesalahan.');
      }
    } else {
      await ctx.reply('Tidak ada aplikasi Netlify yang ditemukan atau terjadi kesalahan.');
    }
  } catch (error) {
    console.error('Error saat menangani /start:', error);
    await ctx.reply('Maaf, terjadi kesalahan saat mencoba mengambil aplikasi Anda.');
  }
});

// --- PERINTAH BARU: /hay (sebelumnya /xxx) ---
bot.command('hay', async (ctx) => { // Perubahan dari 'xxx' menjadi 'hay'
  // Menggunakan force_reply untuk meminta pengguna membalas pesan ini
  await ctx.reply('Masukkan kode di sini', { reply_markup: { force_reply: true } });
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callback_query.data;
  const chatId = ctx.callback_query.message.chat.id;

  await ctx.answerCbQuery();

  if (data.startsWith('app_')) {
    const appId = data.replace('app_', '');
    const apps = await fetchNetlifyApps();
    const selectedApp = apps?.find((app) => app.id === appId);

    if (selectedApp && APP_SUPABASE_CONFIG[selectedApp.name]) {
      const appNameEncoded = encodeURIComponent(selectedApp.name);
      await ctx.reply(
        `Anda memilih aplikasi <b>${selectedApp.name}</b>. Sekarang, apakah Anda ingin mendapatkan kode akses?`,
        { 
          reply_markup: { inline_keyboard: [[{ text: 'Dapatkan Kode Akses', callback_data: `getcode_${appNameEncoded}` }]] },
          parse_mode: 'HTML' 
        }
      );
    } else {
      await ctx.reply('Maaf, konfigurasi Supabase untuk aplikasi ini tidak ditemukan.');
    }
  } 
  else if (data.startsWith('getcode_')) {
    const appNameEncoded = data.replace('getcode_', '');
    const appName = decodeURIComponent(appNameEncoded);
    const config = APP_SUPABASE_CONFIG[appName];

    if (!config) {
      await ctx.reply('Kesalahan: Konfigurasi Supabase untuk aplikasi ini tidak ditemukan.');
      return;
    }

    const supabaseUrl = process.env[config.supabaseUrlEnv];
    const supabaseKey = process.env[config.supabaseKeyEnv];

    if (!supabaseUrl || !supabaseKey) {
      await ctx.reply(`Kesalahan: Kredensial Supabase (${config.supabaseUrlEnv}, ${config.supabaseKeyEnv}) tidak diatur untuk ${appName}.`);
      return;
    }

    await ctx.reply(`Mengambil kode akses untuk ${appName}...`);
    const accessCode = await getAccessCodeFromFunction(supabaseUrl, supabaseKey);
    
    if (accessCode) {
      const accessCodeEncoded = encodeURIComponent(accessCode);
      await ctx.reply(
        `Kode akses Anda: <b>${accessCode}</b>\n\nKlik "Tandai Dipakai" setelah digunakan:`,
        { 
          reply_markup: { inline_keyboard: [[{ text: 'Tandai Dipakai', callback_data: `markused_${appNameEncoded}_${accessCodeEncoded}` }]] },
          parse_mode: 'HTML' 
        }
      );
    } else {
      await ctx.reply('Maaf, tidak ada kode akses yang tersedia saat ini atau terjadi kesalahan.');
    }
  }
  else if (data.startsWith('markused_')) {
    const parts = data.split('_');
    const appNameEncoded = parts[1];
    const accessCodeEncoded = parts[2];

    const appName = decodeURIComponent(appNameEncoded);
    const codeToMark = decodeURIComponent(accessCodeEncoded);
    const config = APP_SUPABASE_CONFIG[appName];

    if (!config) {
      await ctx.reply('Kesalahan: Konfigurasi Supabase untuk aplikasi ini tidak ditemukan.');
      return;
    }

    const supabaseUrl = process.env[config.supabaseUrlEnv];
    const supabaseKey = process.env[config.supabaseKeyEnv];

    if (!supabaseUrl || !supabaseKey) {
      await ctx.reply(`Kesalahan: Kredensial Supabase (${config.supabaseUrlEnv}, ${config.supabaseKeyEnv}) tidak diatur untuk ${appName}.`);
      return;
    }

    await ctx.reply(`Menandai kode ${codeToMark} untuk ${appName} sebagai dipakai...`);
    const success = await markAccessCodeUsed(codeToMark, supabaseUrl, supabaseKey);
    
    if (success) {
      await ctx.reply(`Kode <b>${codeToMark}</b> untuk ${appName} berhasil ditandai sebagai dipakai. Terima kasih!`);
    } else {
      await ctx.reply(`Maaf, gagal menandai kode <b>${codeToMark}</b> untuk ${appName} sebagai dipakai. Silakan coba lagi.`);
    }
  }
});

// --- PERUBAHAN DI SINI: Menangani balasan setelah force_reply ---
bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  // Memeriksa apakah pesan ini adalah balasan (reply) terhadap pesan bot.
  // Dan apakah pesan bot itu yang meminta input kode (force_reply) dengan teks 'Masukkan kode di sini'.
  if (ctx.message.reply_to_message && 
      ctx.message.reply_to_message.from.id === bot.botInfo.id &&
      ctx.message.reply_to_message.text === 'Masukkan kode di sini') { // Memastikan teks balasan asli cocok
    
    const inputCode = text.trim(); // Ambil teks input dari pengguna

    // Kirim balasan dengan greeting dan kode yang diinput
    await ctx.reply(
      `Hai, terima kasih sudah membeli aplikasi saya. Dan ini adalah kode akses Anda: <b>${inputCode}</b>`,
      { parse_mode: 'HTML' }
    );
    return; // Hentikan pemrosesan lebih lanjut
  }

  // Logika yang sudah ada untuk perintah /start atau teks tidak dikenal
  if (text === '/start') {
    // Telegraf's bot.start() handler akan mengurus ini, tidak perlu di sini.
  } else {
    // Ini akan menangani semua pesan teks yang bukan balasan for 'Masukkan kode di sini'
    // dan bukan perintah /start.
    await ctx.reply('Perintah tidak dikenal. Gunakan /start untuk melihat daftar aplikasi.');
  }
});

// --- FUNGSI UTILITY ---

async function fetchNetlifyApps() {
  const response = await fetch(`${NETLIFY_API_URL}/sites`, {
    headers: {
      'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Gagal mengambil aplikasi Netlify:', response.status, errorData);
    throw new Error('Gagal mengambil aplikasi dari Netlify.');
  }

  const apps = await response.json();
  console.log(`Berhasil mengambil ${apps.length} aplikasi Netlify.`);
  return apps;
}

// --- Netlify Lambda Handler ---

exports.handler = async (event) => {
  console.log('Menerima event Netlify Function:', event.httpMethod);

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      body: 'Bot Telegram Netlify Anda berjalan. Kirim pesan /start di Telegram.',
    };
  }

  if (event.httpMethod === 'POST') {
    try {
      // Menggunakan bot.handleUpdate untuk memproses update dari Telegram.
      // Telegraf membutuhkan `botInfo` untuk ctx.message.reply_to_message.from.id === bot.botInfo.id
      // Jadi kita perlu mendapatkan info bot terlebih dahulu jika belum ada.
      if (!bot.botInfo) {
        await bot.telegram.getMe().then((info) => {
          bot.botInfo = info;
        });
      }
      
      await bot.handleUpdate(JSON.parse(event.body));
      console.log('Update Telegram berhasil diproses.');
      return { statusCode: 200, body: 'OK' };
    } catch (error) {
      console.error('Error saat memproses webhook:', error);
      return { statusCode: 200, body: 'Error processing update' };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
