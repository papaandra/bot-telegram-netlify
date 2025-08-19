    // Mengimpor fungsi 'serve' dari library standar Deno.
    import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

    // Baris ini harus muncul di log Netlify Functions jika fungsi berjalan.
    console.log('Fungsi tes Deno dimulai dan siap merespons!');

    // Server Deno akan mendengarkan permintaan HTTP.
    serve(async (req) => {
      console.log('Permintaan diterima. Metode:', req.method);
      // Mengirim respons sukses.
      return new Response('OK - Fungsi Tes Berjalan', { status: 200 });
    });
    
