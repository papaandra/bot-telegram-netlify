// Mengimpor fungsi 'serve' dari library standar Deno untuk membuat server HTTP.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

// Mengimpor library TeleBot untuk interaksi mudah dengan Telegram Bot API.
// URL ini langsung menunjuk ke versi spesifik dari TeleBot.
import { TeleBot } from 'https://deno.land/x/telebot@0.1.0/mod.ts';

// Tambahkan baris ini untuk debugging awal. Ini akan muncul di log Netlify Functions
// jika fungsi berhasil dimulai.
console.log('Fungsi Deno bot.ts dimulai!');

// --- KONFIGURASI ---
// Mengambil token rahasia dari environment variables Netlify.
// Ini penting untuk keamanan dan fleksibilitas deployment.
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const NETLIFY_ACCESS_TOKEN = Deno.env.get('NETLIFY_ACCESS_TOKEN');

// URL dasar Telegram Bot API.
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// URL dasar Netlify API untuk mengambil daftar aplikasi.
// Perhatikan bahwa ini adalah API Netlify, bukan situs Netlify Anda sendiri.
const NETLIFY_API_URL = 'https://api.netlify.com/api/v1';

// Memastikan bahwa semua environment variables yang diperlukan telah diatur.
// Jika tidak, bot tidak akan berfungsi dan akan mencatat error.
if (!TELEGRAM_BOT_TOKEN || !NETLIFY_ACCESS_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN atau NETLIFY_ACCESS_TOKEN tidak diatur sebagai environment variables.');
  // Keluar dari proses jika environment variables penting hilang.
  // Ini mencegah error lebih lanjut saat runtime.
  Deno.exit(1); 
}

// Menginisialisasi instance TeleBot dengan token bot Anda.
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
    
    // Melakukan permintaan POST ke Telegram API.
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
    return apps;
  } catch (error) {
    console.error('Error saat mengambil aplikasi Netlify:', error);
    return null;
  }
}

/**
 * Mengambil kode akses dari fungsi Netlify 'get-access-code'.
 */
async function getAccessCode(): Promise<string | null> {
  try {
    // URL ini harus disesuaikan dengan URL Netlify Functions Anda
    // Asumsi get-access-code.js di-deploy di situs Netlify yang sama dengan miniweb.
    const accessCodeFunctionUrl = `https://telegram-akses-bot.netlify.app/.netlify/functions/get-access-code`;
    
    const response = await fetch(accessCodeFunctionUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gagal mengambil kode akses:', response.status, errorData);
      return null;
    }

    const data = await response.json();
    return data.accessCode || null;
  } catch (error) {
    console.error('Error saat melakukan panggilan ke get-access-code:', error);
    return null;
  }
}

/**
 * Menandai kode akses sebagai sudah digunakan melalui fungsi Netlify 'mark-code-used'.
 * @param code Kode akses yang akan ditandai.
 */
async function markCodeUsed(code: string): Promise<boolean> {
  try {
    // URL ini harus disesuaikan dengan URL Netlify Functions Anda
    const markCodeUsedFunctionUrl = `https://telegram-akses-bot.netlify.app/.netlify/functions/mark-code-used`;
    
    const response = await fetch(markCodeUsedFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accessCode: code })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gagal menandai kode akses digunakan:', response.status, errorData);
      return false;
    }

    console.log(`Kode ${code} berhasil ditandai sebagai digunakan.`);
    return true;
  } catch (error) {
    console.error('Error saat melakukan panggilan ke mark-code-used:', error);
    return false;
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
      await sendTelegramMessage(chatId, 'Selamat datang! Memulai bot Anda...');
      
      const apps = await fetchNetlifyApps();
      if (apps && apps.length > 0) {
        const keyboard = apps.map((app: any) => [{ text: app.name, callback_data: `app_${app.id}` }]);
        await sendTelegramMessage(
          chatId,
          'Silakan pilih aplikasi Netlify Anda untuk mendapatkan kode akses:',
          { inline_keyboard: keyboard }
        );
      } else {
        await sendTelegramMessage(chatId, 'Tidak ada aplikasi Netlify yang ditemukan atau terjadi kesalahan.');
      }
    } else if (text === '/getcode') {
      const code = await getAccessCode();
      if (code) {
        await sendTelegramMessage(chatId, `Kode akses Anda: <b>${code}</b>\n\nKlik "Gunakan Kode Ini" setelah Anda menggunakannya:`, {
          inline_keyboard: [[{ text: 'Gunakan Kode Ini', callback_data: `usecode_${code}` }]]
        });
      } else {
        await sendTelegramMessage(chatId, 'Maaf, tidak ada kode akses yang tersedia saat ini. Silakan coba lagi nanti.');
      }
    } else {
      await sendTelegramMessage(chatId, 'Perintah tidak dikenal. Gunakan /start untuk memulai.');
    }
  }

  // Menangani callback query dari tombol inline
  if (update.callback_query) {
    const callbackQuery = update.callback_query;
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    // Menjawab callback query agar tombol tidak terus berputar atau tampil error di Telegram
    await bot.answerCallbackQuery(callbackQuery.id);

    if (data.startsWith('app_')) {
      const appId = data.replace('app_', '');
      // Di sini Anda bisa menambahkan logika spesifik untuk setiap aplikasi,
      // misalnya menampilkan detail aplikasi atau langsung memberikan kode akses.
      // Untuk tujuan demo, kita akan langsung menawarkan kode akses.
      await sendTelegramMessage(chatId, `Anda memilih aplikasi. Gunakan /getcode untuk mendapatkan kode akses.`);
    } else if (data.startsWith('usecode_')) {
      const codeToMark = data.replace('usecode_', '');
      const success = await markCodeUsed(codeToMark);
      if (success) {
        await sendTelegramMessage(chatId, `Kode akses <b>${codeToMark}</b> berhasil ditandai sebagai digunakan. Terima kasih!`);
      } else {
        await sendTelegramMessage(chatId, `Maaf, gagal menandai kode <b>${codeToMark}</b> sebagai digunakan. Silakan coba lagi atau hubungi admin.`);
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

