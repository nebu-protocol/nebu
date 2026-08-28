/**
 * i18n ringan tanpa library. KUNCI = string SUMBER apa adanya (bahasa saat ditulis di kode).
 * Codebase CAMPURAN: sebagian ditulis Inggris (nav, landing, halaman server), sebagian Indonesia
 * (komponen kelola portfolio). Karena itu DUA kamus, dipilih per locale TARGET; fallback identity:
 *  - target 'id' → ID_DICT (sumber-Inggris → Indonesia); string sumber-Indonesia sudah ID → identity.
 *  - target 'en' → EN_DICT (sumber-Indonesia → Inggris); string sumber-Inggris sudah EN → identity.
 * Jadi tiap string dikunci bahasa SUMBER-nya; kamus lawan-bahasa yang menerjemahkan. Coverage boleh
 * parsial (yang tak ada jatuh balik ke sumber). Default 'en' (juri hackathon internasional). Locale
 * di cookie `lang` supaya server & client sama-sama baca (i18n-server.ts & i18n-client.tsx).
 */
export type Locale = "en" | "id";
export const LOCALES: readonly Locale[] = ["en", "id"] as const;
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

export function normalizeLocale(v: string | undefined | null): Locale {
  return v === "id" ? "id" : "en";
}

/** EN-source → ID. Untuk string yang DITULIS dalam bahasa Inggris (nav, landing, halaman server). */
export const ID_DICT: Record<string, string> = {
  Overview: "Ringkasan",
  Action: "Aksi",
  Activity: "Aktivitas",
  "Address copied ✓": "Alamat disalin ✓",
  Agent: "Agen",
  "Agent (bot):": "Agen (bot):",
  "Agent (deposit)": "Agen (deposit)",
  "Agent wallet": "Wallet agen",
  "All actions": "Semua aksi",
  "All status": "Semua status",
  Amount: "Jumlah",
  "An unexpected error occurred. Try again, or come back in a moment.":
    "Terjadi kesalahan tak terduga. Coba lagi, atau kembali sebentar lagi.",
  "Avg net vs HODL": "Rata-rata net vs HODL",
  "Back to Overview": "Kembali ke Ringkasan",
  Block: "Blok",
  "Bot (collector)": "Bot (kolektor)",
  "Close LP": "Tutup LP",
  "Closed positions": "Posisi ditutup",
  "Connect wallet": "Hubungkan wallet",
  "Copy Address": "Salin Alamat",
  Custom: "Kustom",
  Deployed: "Terdeploy",
  "Disconnect Wallet": "Putuskan Wallet",
  "Error log": "Log error",
  "Execute now": "Jalankan sekarang",
  FAILED: "GAGAL",
  Fees: "Fee",
  Flow: "Alur",
  Leaderboard: "Papan Peringkat",
  Network: "Jaringan",
  "Open positions": "Posisi terbuka",
  "Owner-only withdraw.": "Tarik khusus owner.",
  "Page not found": "Halaman tidak ditemukan",
  Portfolio: "Portofolio",
  Positions: "Posisi",
  "Price feed (ETH/USD)": "Feed harga (ETH/USD)",
  "Price-stop % (drop token)": "Price-stop % (token turun)",
  Privacy: "Privasi",
  "Processing…": "Memproses…",
  "Risk manager": "Manajer risiko",
  Safe: "Aman",
  "Save settings": "Simpan pengaturan",
  "Secure vault (BSC)": "Vault aman (BSC)",
  "Sign to manage": "Tanda tangan untuk kelola",
  "Something went wrong": "Ada yang tidak beres",
  "Strategy edge": "Keunggulan strategi",
  "Swaps/h": "Swap/jam",
  "System status": "Status sistem",
  Terms: "Ketentuan",
  "The page you are looking for does not exist or has moved.":
    "Halaman yang kamu cari tidak ada atau telah dipindahkan.",
  "Top pools": "Pool teratas",
  "Total Portfolio Value": "Total Nilai Portofolio",
  "Total value · net vs HODL (on-chain)": "Total nilai · net vs HODL (on-chain)",
  "Total value · net vs HODL (sim)": "Total nilai · net vs HODL (sim)",
  Trend: "Tren",
  "Try again": "Coba lagi",
  "Needs attention": "Perlu perhatian",
  Down: "Bermasalah",
  "View Full Portfolio": "Lihat Portofolio Lengkap",
  "Welcome,": "Selamat datang,",
  When: "Kapan",
  "Win rate": "Rasio menang",
  Withdraw: "Tarik",
  "Withdraw all": "Tarik semua",
  "Your PnL": "PnL kamu",
  "Your positions": "Posisi kamu",
  close: "tutup",
  copied: "disalin",
  "copied ✓": "disalin ✓",
  copy: "salin",
  disconnect: "putuskan",
  "next →": "berikutnya →",
  "remove agent": "hapus agen",
  withdraw: "tarik",
  "Δ recent": "Δ terkini",
  "← prev": "← sebelumnya",
};

/** ID→EN. Untuk string yang DITULIS dalam bahasa Indonesia (komponen kelola portfolio + sebagian halaman). */
export const EN_DICT: Record<string, string> = {
  "(bisa naik/turun jauh) — fee cuma sebagian kecil.":
    "(can swing far up/down) — fee is only a small part.",
  ". PnL LP sebenarnya didominasi": ". Actual LP PnL is dominated by",
  "Bot bikin wallet baru khusus kamu. Kamu": "The bot creates a new wallet just for you. You",
  "Buat agent wallet": "Create agent wallet",
  "Buat agent wallet dulu.": "Create an agent wallet first.",
  "Buat vault": "Create vault",
  "Cabut semua LP + withdraw semua": "Pull all LP + withdraw all",
  "Cap notional per operasi (BNB) — batas dana per aksi bot":
    "Notional cap per operation (BNB) — fund limit per bot action",
  "Cari pair / aksi…": "Search pair / action…",
  "Connect wallet owner-mu dulu.": "Connect your owner wallet first.",
  "Dana di kontrak vault — bot cuma bisa LP,": "Funds sit in the vault contract — the bot can only LP,",
  "Dana ditarik ke wallet owner yang kamu connect.": "Funds are withdrawn to the owner wallet you connect.",
  "Deposit + aktifkan": "Deposit + activate",
  "Deposit dibatalkan / gagal.": "Deposit cancelled / failed.",
  "Deposit diterima.": "Deposit received.",
  "Deposit ke vault": "Deposit to vault",
  "Deposit ke vault terkirim ✓": "Deposit to vault sent ✓",
  "Deposit terkirim ✓": "Deposit sent ✓",
  "Deposit terkirim ✓ · automation aktif": "Deposit sent ✓ · automation active",
  "Est. fee / bln": "Est. fee / mo",
  "Est. fee / thn": "Est. fee / yr",
  "Fund (ETH) — dari saldo agent": "Fund (ETH) — from agent balance",
  "Gagal:": "Failed:",
  "Hubungkan wallet apa saja (mobile OK), lalu tanda tangan untuk kelola agent LP-mu.":
    "Connect any wallet (mobile OK), then sign to manage your LP agent.",
  "Jumlah (ETH)": "Amount (ETH)",
  "Langsung aktifkan automation (bot pakai dana ini)":
    "Activate automation right away (bot uses these funds)",
  "Membuat vault…": "Creating vault…",
  "Membuat…": "Creating…",
  "Menandatangani…": "Signing…",
  "Menarik…": "Withdrawing…",
  "Mengirim…": "Sending…",
  "Menjalankan…": "Executing…",
  "Menutup semua LP + menarik… (bisa ~1 menit)": "Closing all LP + withdrawing… (can take ~1 min)",
  "Menyimpan…": "Saving…",
  Naikkan: "Raise",
  "Pindah ke wallet yang kamu connect (owner) dulu.":
    "Switch to the wallet you connected (owner) first.",
  "Pindahkan wallet ke BNB Smart Chain (56) dulu.": "Switch your wallet to BNB Smart Chain (56) first.",
  "Saldo agent": "Agent balance",
  "Saldo agent kurang untuk deploy 1 posisi + gas — deposit dulu":
    "Agent balance too low to deploy 1 position + gas — deposit first",
  "Saldo agent:": "Agent balance:",
  "Seberapa agresif bot potong rugi & ambil untung untuk agent-mu.":
    "How aggressively the bot cuts losses & takes profit for your agent.",
  "Set Fund = saldo": "Set Fund = balance",
  "Simpan custom": "Save custom",
  "Stop-loss = keluar saat rugi net. Price-stop = fail-safe dari harga token. TP trail = jarak retrace dari puncak sebelum kunci untung. Default":
    "Stop-loss = exit on net loss. Price-stop = fail-safe from token price. TP trail = retrace distance from the peak before locking in profit. Default",
  "Tanda tangan dibatalkan.": "Signature cancelled.",
  "Tarik seluruh saldo agent (sisakan sedikit untuk gas).":
    "Withdraw the entire agent balance (leave a little for gas).",
  "Tersimpan ✓": "Saved ✓",
  "Tidak ada aktivitas untuk filter ini.": "No activity for this filter.",
  "Tutup semua posisi (burn + swap balik ke ETH), lalu tarik seluruh saldo ke owner.":
    "Close all positions (burn + swap back to ETH), then withdraw the entire balance to the owner.",
  "Vault dibuat ✓ — sekarang deposit BNB.": "Vault created ✓ — now deposit BNB.",
  "Vault factory belum dikonfigurasi (deploy dulu, set NEXT_PUBLIC_LP_VAULT_FACTORY).":
    "Vault factory not configured yet (deploy first, set NEXT_PUBLIC_LP_VAULT_FACTORY).",
  "Wallet tidak terhubung.": "Wallet not connected.",
  "Withdraw dulu — masih ada dana": "Withdraw first — funds still remain",
  aktif: "active",
  "aktivitas · hal": "activity · page",
  "balik ke wallet ini kapan saja — tanpa share private key sendiri.":
    "back to this wallet anytime — without sharing your own private key.",
  batal: "cancel",
  "belum ada": "none yet",
  "est. gross · fee saja": "est. gross · fee only",
  "fee saja": "fee only",
  "harga token": "token price",
  "ke address-nya, bot LP dari saldo itu, dan bisa": "to its address, the bot LPs from that balance, and can",
  "ke saldo agent baru — bot cuma deploy sampai batas Fund, jadi deposit tanpa naikin Fund tak terpakai.":
    "to the new agent balance — the bot only deploys up to the Fund limit, so a deposit without raising Fund goes unused.",
  "tak bisa kuras": "can't drain",
  "verifikasi gagal": "verification failed",
  "withdraw balik ke sini": "withdraw back here",
  "— bisa dicabut kapan saja.": "— can be revoked anytime.",
  "⚠️ Ini estimasi": "⚠️ This estimate is",
  "✕ tutup": "✕ close",
  // Sisa string sumber-Indonesia di halaman server (dibungkus post-pass, lihat commit).
  "Portfolio kamu": "Your portfolio",
  "Connect wallet di Portfolio untuk melihat nilai posisimu.":
    "Connect a wallet in Portfolio to see your position value.",
  "APR gross (pre-IL). Δ dari time-series harga on-chain. Bukan nasihat finansial.":
    "Gross APR (pre-IL). Δ from on-chain price time-series. Not financial advice.",
  nonaktif: "inactive",
  "· belum jalan": "· not run yet",
  "Belum jalan": "Not run yet",
  "Tidak ada error tercatat ✓": "No errors logged ✓",
  "Rasio rata-rata untung ÷ rata-rata rugi posisi tertutup. Edge strategi positif kalau ≥ ~4.2:1 pada win-rate rendah; di bawahnya, edge tipis/negatif.":
    "Average win ÷ average loss on closed positions. Strategy edge is positive at ≥ ~4.2:1 on a low win-rate; below that, the edge is thin/negative.",
  "Rata-rata untung ÷ rugi posisi tertutup. Target ≥ 4.2:1.":
    "Average win ÷ loss on closed positions. Target ≥ 4.2:1.",
  SIMULASI: "SIMULATED",
  "aksi on-chain": "on-chain actions",
  "fase:": "phase:",
  "Tak merespons": "No response",
  latensi: "latency",
  "gagal / 24 jam": "failed / 24h",
  "Auto-refresh saat dibuka ulang. Heartbeat ditulis collector tiap siklus + exit-watch (~1-2 menit).":
    "Auto-refreshes when reopened. Heartbeat is written by the collector every cycle + exit-watch (~1-2 min).",
  "Menutup…": "Closing…",
  "Belum ada data — collector sedang mengumpulkan.": "No data yet — the collector is still gathering.",
  "Belum ada wallet dengan posisi + PnL. Cek lagi setelah bot deploy & hitung PnL.":
    "No wallets with positions + PnL yet. Check back after the bot deploys & computes PnL.",
  "Belum ada posisi. Aktifkan automation + fund untuk mulai.":
    "No positions yet. Enable automation + fund to start.",
  "Belum cukup data — collector sedang mengumpulkan time-series.":
    "Not enough data yet — the collector is still gathering the time-series.",
  "LP Bot menyediakan automated liquidity provision di PancakeSwap Infinity (BNB Smart Chain). Semua angka APR/PnL bersifat gross (pre-IL), berbasis simulasi, dan bukan jaminan hasil. Menyediakan likuiditas pada pool volatil (mis. memecoin) berisiko tinggi termasuk impermanent loss dan kehilangan sebagian/seluruh modal. Tidak ada di halaman ini yang merupakan nasihat investasi, hukum, pajak, atau finansial.":
    "LP Bot provides automated liquidity provision on PancakeSwap Infinity (BNB Smart Chain). All APR/PnL figures are gross (pre-IL), simulation-based, and not a guarantee of returns. Providing liquidity to volatile pools (e.g. memecoins) is high-risk, including impermanent loss and the loss of part or all of your capital. Nothing on this page constitutes investment, legal, tax, or financial advice.",
  "LP Bot tidak mengumpulkan data pribadi. Yang kami simpan hanya data on-chain publik (pool, posisi) dan—bila kamu mengaktifkan automation—private key wallet yang kamu berikan, disimpan terenkripsi (AES-256-GCM) di server dan hanya dipakai untuk menjalankan strategi LP. Connect wallet hanya membaca alamat publik.":
    "LP Bot collects no personal data. We store only public on-chain data (pools, positions) and—if you enable automation—the wallet private key you provide, kept encrypted (AES-256-GCM) on the server and used only to run the LP strategy. Connecting a wallet only reads your public address.",
  "LP Bot disediakan apa adanya, tanpa jaminan. Menyediakan likuiditas berisiko (impermanent loss, rug, kehilangan modal). Angka APR/PnL bersifat gross dan simulasi—bukan jaminan hasil dan bukan nasihat finansial. Dengan menggunakan layanan ini kamu menerima seluruh risiko atas dana yang kamu kelola.":
    "LP Bot is provided as-is, without warranty. Providing liquidity is risky (impermanent loss, rugs, loss of capital). APR/PnL figures are gross and simulation-based—not a guarantee of returns and not financial advice. By using this service you accept all risk over the funds you manage.",
};

/** Terjemahkan satu string ke locale target; pilih kamus lawan-bahasa, fallback ke sumber. */
export function translate(locale: Locale, s: string): string {
  const dict = locale === "id" ? ID_DICT : EN_DICT;
  return dict[s] ?? s;
}
