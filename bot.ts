// Mengimpor fungsi 'serve' dari library standar Deno.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

// --- KONFIGURASI ---
// Ambil token rahasia dari environment variables.
// Anda perlu membuat file .env dan menjalankannya dengan 'deno run --allow-net --allow-env index.ts'
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const NETLIFY_ACCESS_TOKEN = Deno.env.get('NETLIFY_ACCESS_TOKEN');
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Header CORS untuk testing (opsional untuk webhook).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- FUNGSI HELPER TELEGRAM ---

/**
 * Mengirim pesan ke chat Telegram.
 * @param chatId ID dari chat tujuan.
 * @param text Teks pesan yang akan dikirim.
 * @param replyMarkup (Opsional) Keyboard inline untuk tombol.
 */
async function sendMessage(chatId: number, text: string, replyMarkup: any = null) {
  const url = `${TELEGRAM_API_URL}/sendMessage`;
  const payload: any = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown',
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// --- FUNGSI HELPER NETLIFY ---

/**
 * Mengambil daftar situs dari akun Netlify.
 */
async function getNetlifySites() {
  const url = 'https://api.netlify.com/api/v1/sites';
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${NETLIFY_ACCESS_TOKEN}`,
    },
  });
  if (!response.ok) {
    console.error('Gagal mengambil data dari Netlify API');
    return [];
  }
  const sites = await response.json();
  // Filter hanya situs yang relevan jika perlu, contoh: punya nama tertentu
  return sites.map((site: any) => ({
    name: site.name,
    url: site.ssl_url, // atau site.url
  }));
}


// --- SERVER UTAMA ---

console.log('✅ Telegram Bot Server initialized. Waiting for webhooks...');

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('--- 📥 Webhook Received ---', JSON.stringify(body, null, 2));

    // Cek apakah ini callback dari tombol (user menekan tombol)
    if (body.callback_query) {
      const { message, data } = body.callback_query;
      const chatId = message.chat.id;
      const siteName = data;

      // ALUR SELANJUTNYA:
      // Bot akan memanggil API di aplikasi Netlify yang dipilih.
      // Contoh: https://[siteName].netlify.app/.netlify/functions/get-kode-akses
      // Untuk sekarang, kita hanya kirim konfirmasi.
      
      await sendMessage(chatId, `Anda memilih: *${siteName}*.\n\nMeminta kode akses... (fitur ini sedang dikembangkan)`);
      return new Response('ok');
    }

    // Cek apakah ini pesan baru
    if (body.message) {
      const { chat, text } = body.message;
      const chatId = chat.id;

      // Tangani perintah /start
      if (text === '/start') {
        await sendMessage(chatId, 'Selamat datang! Mengambil daftar aplikasi Anda dari Netlify...');
        
        const sites = await getNetlifySites();
        if (sites.length === 0) {
          await sendMessage(chatId, 'Tidak dapat menemukan aplikasi di akun Netlify Anda.');
          return new Response('ok');
        }

        // Membuat tombol untuk setiap situs
        const keyboard = {
          inline_keyboard: sites.map((site: any) => ([{
            text: site.name,
            callback_data: site.name, // Data yang dikirim saat tombol ditekan
          }])),
        };

        await sendMessage(chatId, 'Silakan pilih aplikasi untuk mendapatkan kode akses:', keyboard);
      } else {
        await sendMessage(chatId, 'Perintah tidak dikenali. Silakan ketik /start untuk memulai.');
      }
    }

    return new Response('Webhook processed');

  } catch (error) {
    console.error('--- ❌ An error occurred! ---', error);
    return new Response(JSON.stringify({ error: 'Failed to process webhook.' }), { status: 500 });
  }
});
