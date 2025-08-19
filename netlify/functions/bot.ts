// deno-runtime
// Import 'serve' untuk membuat server HTTP dari library standar Deno.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// Import 'TeleBot' untuk berinteraksi dengan Telegram Bot API.
import { TeleBot } from 'https://deno.land/x/telebot@0.1.0/mod.ts';

// Log ini akan muncul di log Netlify Functions jika fungsi berhasil dimulai.
console.log('Bot Telegram Deno dimulai dan siap!');

// --- KONFIGURASI ---
// Mengambil token bot Telegram dan token akses Netlify dari Environment Variables.
// Ini sangat penting untuk keamanan. Pastikan Anda sudah mengaturnya di Netlify.
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const NETLIFY_ACCESS_TOKEN = Deno.env.get('NETLIFY_ACCESS_TOKEN');

// URL dasar Telegram Bot API
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
// URL dasar Netlify API untuk mengambil daftar situs/aplikasi
const NETLIFY_API_URL = 'https://api.netlify.com/api/v1';

// Memastikan Environment Variables penting sudah diatur.
// Jika tidak, log error dan hentikan eksekusi fungsi.
if (!TELEGRAM_BOT_TOKEN || !NETLIFY_ACCESS_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN atau NETLIFY_ACCESS_TOKEN tidak diatur. Mohon atur di Netlify Environment Variables.');
  // Menghentikan proses dengan error jika variabel tidak ada.
  Deno.exit(1);
}

// Inisialisasi instance TeleBot
const bot = new TeleBot(TELEGRAM_BOT_TOKEN);

// --- FUNGSI UTILITY ---

/**
 * Mengirim pesan teks ke pengguna Telegram.
 * @param chatId ID chat Telegram penerima.
 * @param text Pesan yang akan dikirim.
 * @param replyMarkup Opsi markup balasan (misalnya, tombol keyboard inline).
 */
async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  try {
    const url = `${TELEGRAM_API_URL}/sendMessage`;
    const body = {
      chat_id: chatId,
      text: text,
      reply_markup: replyMarkup ? JSON.stringify(replyMarkup) : undefined,
      parse_mode: 'HTML' // Mengaktifkan parsing HTML dalam pesan
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gagal mengirim pesan Telegram:', response.status, errorData);
    }
  } catch (error) {
    console.error('Error saat mengirim pesan Telegram:', error);
  }
}

/**
 * Mengambil daftar aplikasi Netlify dari akun yang terhubung.
 * Menggunakan NETLIFY_ACCESS_TOKEN untuk otentikasi.
 */
async function fetchNetlifyApps() {
  try {
    const response = await fetch(`${NETLIFY_API_URL}/sites`, {
      headers: {
        'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gagal mengambil aplikasi Netlify:', response.status, errorData);
      return null;
    }

    const apps = await response.json();
    console.log(`Berhasil mengambil ${apps.length} aplikasi Netlify.`);
    return apps;
  } catch (error) {
    console.error('Error saat mengambil aplikasi Netlify:', error);
    return null;
  }
}

// --- HANDLER UPDATE TELEGRAM ---

/**
 * Fungsi utama untuk menangani semua pembaruan yang masuk dari Telegram.
 * Ini adalah titik masuk untuk logika bot.
 * @param update Objek pembaruan dari Telegram.
 */
async function handleUpdate(update: any) {
  console.log('Menerima update Telegram:', update);

  // Menangani pesan teks
  if (update.message) {
    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text;

    if (text === '/start') {
      await sendTelegramMessage(chatId, 'Selamat datang! Mengambil daftar aplikasi Anda dari Netlify...');

      const apps = await fetchNetlifyApps();
      if (apps && apps.length > 0) {
        // Membuat keyboard inline dengan nama aplikasi
        // Callback data menggunakan format 'app_APP_ID'
        const keyboard = apps.map((app: any) => [{ text: app.name, callback_data: `app_${app.id}` }]);
        await sendTelegramMessage(
          chatId,
          'Silakan pilih aplikasi Netlify Anda:',
          { inline_keyboard: keyboard }
        );
      } else {
        await sendTelegramMessage(chatId, 'Tidak ada aplikasi Netlify yang ditemukan atau terjadi kesalahan.');
      }
    } else {
      await sendTelegramMessage(chatId, 'Perintah tidak dikenal. Gunakan /start untuk melihat daftar aplikasi.');
    }
  }

  // Menangani callback query dari tombol inline (saat pengguna mengklik tombol)
  if (update.callback_query) {
    const callbackQuery = update.callback_query;
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    // Menjawab callback query agar tombol tidak terus berputar atau tampil error di Telegram
    await bot.answerCallbackQuery(callbackQuery.id);

    if (data.startsWith('app_')) {
      const appId = data.replace('app_', '');

      // Mengambil ulang daftar aplikasi untuk mendapatkan URL admin yang tepat
      const apps = await fetchNetlifyApps();
      const selectedApp = apps?.find((app: any) => app.id === appId);

      if (selectedApp && selectedApp.admin_url) {
        // Mengirim pesan dengan tombol URL ke halaman admin
        await sendTelegramMessage(
          chatId,
          `Ini adalah link admin untuk <b>${selectedApp.name}</b>:`,
          { inline_keyboard: [[{ text: 'Buka Halaman Admin', url: selectedApp.admin_url }]] }
        );
      } else {
        await sendTelegramMessage(chatId, 'Maaf, tidak dapat menemukan detail aplikasi atau URL admin.');
      }
    }
  }
}

// --- SERVER HTTP DENO ---

// Server Deno akan mendengarkan permintaan HTTP yang datang dari webhook Telegram.
serve(async (req) => {
  // Hanya memproses permintaan POST dari Telegram.
  if (req.method === 'POST') {
    try {
      const update = await req.json(); // Menguraikan body permintaan sebagai JSON update Telegram.
      await handleUpdate(update); // Meneruskan update ke fungsi penanganan.
      // Mengirim respons sukses ke Telegram agar tidak mencoba mengirim ulang update.
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error saat memproses permintaan webhook:', error);
      // Mengirim respons error ke Telegram, tapi tetap 200 OK untuk menghindari retry berlebihan.
      return new Response('Error', { status: 200 });
    }
  } else if (req.method === 'GET') {
    // Respons untuk permintaan GET (misalnya saat mengunjungi URL fungsi langsung di browser).
    console.log('Menerima permintaan GET.');
    return new Response('Bot Telegram Netlify Anda berjalan. Kirim pesan /start di Telegram.', { status: 200 });
  }

  // Menangani metode HTTP lain yang tidak didukung.
  return new Response('Metode Tidak Diizinkan', { status: 405 });
});
