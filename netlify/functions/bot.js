// netlify/functions/bot.js

// Menggunakan require untuk mengimpor modul di Node.js.
// node-fetch: Library untuk melakukan permintaan HTTP (mengganti fetch bawaan Deno).
// telegraf: Framework bot Telegram untuk Node.js.
const fetch = require('node-fetch');
const { Telegraf } = require('telegraf');

// Log ini akan muncul di log Netlify Functions jika fungsi berhasil dimulai.
console.log('Bot Telegram Node.js dimulai dan siap!');

// --- KONFIGURASI ---
// Mengambil token bot Telegram dan token akses Netlify dari Environment Variables.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const NETLIFY_ACCESS_TOKEN = process.env.NETLIFY_ACCESS_TOKEN;

// URL dasar Netlify API untuk mengambil daftar situs/aplikasi
const NETLIFY_API_URL = 'https://api.netlify.com/api/v1';

// Memastikan Environment Variables penting sudah diatur.
if (!TELEGRAM_BOT_TOKEN || !NETLIFY_ACCESS_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN atau NETLIFY_ACCESS_TOKEN tidak diatur.');
  return {
    statusCode: 500,
    body: JSON.stringify({ message: 'Konfigurasi server tidak lengkap.' }),
  };
}

// Inisialisasi instance Telegraf
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// --- HANDLER UPDATE TELEGRAM ---

// Handler untuk perintah /start
bot.start(async (ctx) => {
  console.log('Menerima perintah /start dari', ctx.from.id);
  await ctx.reply('Selamat datang! Mengambil daftar aplikasi Anda dari Netlify...');

  try {
    const apps = await fetchNetlifyApps();
    if (apps && apps.length > 0) {
      // Membuat keyboard inline dengan nama aplikasi
      const keyboard = apps.map((app) => [{ text: app.name, callback_data: `app_${app.id}` }]);
      await ctx.reply(
        'Silakan pilih aplikasi Netlify Anda:',
        { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'HTML' }
      );
    } else {
      await ctx.reply('Tidak ada aplikasi Netlify yang ditemukan atau terjadi kesalahan.');
    }
  } catch (error) {
    console.error('Error saat menangani /start:', error);
    await ctx.reply('Maaf, terjadi kesalahan saat mencoba mengambil aplikasi Anda.');
  }
});

// Handler untuk callback query dari tombol inline
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const chatId = ctx.callbackQuery.message.chat.id;

  // Menjawab callback query agar tombol tidak terus berputar atau tampil error di Telegram
  await ctx.answerCbQuery(); // Penting agar tidak ada loading di tombol

  if (data.startsWith('app_')) {
    const appId = data.replace('app_', '');
    
    try {
      // Mengambil ulang daftar aplikasi untuk mendapatkan URL admin yang tepat
      const apps = await fetchNetlifyApps();
      const selectedApp = apps?.find((app) => app.id === appId);

      if (selectedApp && selectedApp.admin_url) {
        // Mengirim pesan dengan tombol URL ke halaman admin
        await ctx.reply(
          `Ini adalah link admin untuk <b>${selectedApp.name}</b>:`,
          { 
            reply_markup: { inline_keyboard: [[{ text: 'Buka Halaman Admin', url: selectedApp.admin_url }]] },
            parse_mode: 'HTML' 
          }
        );
      } else {
        await ctx.reply('Maaf, tidak dapat menemukan detail aplikasi atau URL admin.');
      }
    } catch (error) {
      console.error('Error saat menangani callback query:', error);
      await ctx.reply('Maaf, terjadi kesalahan saat mencoba mendapatkan detail aplikasi.');
    }
  }
});

// Handler untuk pesan teks lainnya
bot.on('text', async (ctx) => {
  if (ctx.message.text !== '/start') { // Hindari duplikasi respon untuk /start
    await ctx.reply('Perintah tidak dikenal. Gunakan /start untuk melihat daftar aplikasi.');
  }
});

// --- FUNGSI UTILITY ---

/**
 * Mengambil daftar aplikasi Netlify dari akun yang terhubung.
 * Menggunakan NETLIFY_ACCESS_TOKEN untuk otentikasi.
 */
async function fetchNetlifyApps() {
  const response = await fetch(`${NETLIFY_API_URL}/sites`, {
    headers: {
      'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Gagal mengambil aplikasi Netlify:', response.status, errorData);
    throw new Error('Gagal mengambil aplikasi dari Netlify.'); // Lempar error untuk ditangkap di atas
  }

  const apps = await response.json();
  console.log(`Berhasil mengambil ${apps.length} aplikasi Netlify.`);
  return apps;
}

// --- Netlify Lambda Handler ---

// Ini adalah fungsi utama yang akan dipanggil oleh Netlify setiap kali ada update dari Telegram.
exports.handler = async (event) => {
  console.log('Menerima event Netlify Function:', event.httpMethod);

  // Jika bukan POST request (misal: GET saat mengunjungi URL fungsi),
  // berikan respons informasi.
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      body: 'Bot Telegram Netlify Anda berjalan. Kirim pesan /start di Telegram.',
    };
  }

  // Hanya memproses permintaan POST dari Telegram.
  if (event.httpMethod === 'POST') {
    try {
      // Menggunakan bot.handleUpdate untuk memproses update dari Telegram.
      await bot.handleUpdate(JSON.parse(event.body));
      console.log('Update Telegram berhasil diproses.');
      return { statusCode: 200, body: 'OK' }; // Penting untuk respons 200 OK ke Telegram
    } catch (error) {
      console.error('Error saat memproses webhook:', error);
      return { statusCode: 200, body: 'Error processing update' }; // Tetap 200 OK untuk menghindari retry Telegram
    }
  }

  // Metode HTTP lain tidak diizinkan.
  return { statusCode: 405, body: 'Method Not Allowed' };
};
