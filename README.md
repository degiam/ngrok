# Ngrok Custom Domain Proxy — Netlify

Solusi **Custom Domain Gratis** untuk tunnel ngrok lokal tanpa perlu berlangganan paket berbayar (ngrok Premium).

Di akun ngrok Free, Anda hanya diberikan URL acak (seperti `https://abc123.ngrok-free.app`) dan fitur custom domain dikunci untuk pengguna berbayar. Repositori ini mengatasi keterbatasan tersebut dengan memanfaatkan **Netlify Functions** sebagai reverse proxy publik dan **Cloudflare DNS** untuk mengarahkan domain pribadi Anda ke tunnel lokal secara gratis, lengkap dengan halaman fallback offline ketika komputer/server lokal Anda mati.

---

### Keunggulan
- 🆓 **100% Gratis**: Pasang custom domain sendiri (misal: `ngrok.domainanda.com` atau `demo.domainanda.com`) tanpa langganan ngrok berbayar.
- 🛡️ **Halaman Offline Kustom**: Jika ngrok atau server lokal mati, pengunjung langsung melihat halaman *offline/maintenance* kustom profesional (bukan halaman error bawaan ngrok).
- ⚡ **Serverless**: Berjalan di atas Netlify Functions (Free Tier) & Netlify Edge, tanpa perlu menyewa dan memelihara VPS.

---

## Cara Kerja

```
Domain Kustom (ngrok.domainanda.com)
                ↓
      Cloudflare DNS (CNAME)
                ↓
         Netlify Edge
                ↓
      Netlify Functions (Proxy)
                ↓
 ┌───────────────────────┬──────────────────────┐
 │  Jika ngrok aktif:    │ Jika ngrok offline:  │
 │  → ngrok tunnel       │ → Halaman offline    │
 │  → localhost:8000     │   (public/index.html)│
 └───────────────────────┴──────────────────────┘
```

Setiap request ke domain kustom Anda akan diteruskan oleh Netlify Function ke `TARGET_URL` (URL ngrok aktif Anda). Jika tunnel ngrok terputus atau komputer lokal Anda mati, Netlify secara otomatis menyajikan halaman `public/index.html`.

---

## 1. Instalasi ngrok di Lokal

### Instalasi

**macOS (Homebrew)**
```bash
brew install ngrok
```

**Linux (Debian/Ubuntu)**
```bash
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
  | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null \
  && echo "deb https://ngrok-agent.s3.amazonaws.com bookworm main" \
  | sudo tee /etc/apt/sources.list.d/ngrok.list \
  && sudo apt update \
  && sudo apt install ngrok
```

**Windows (WinGet)**
```bash
winget install ngrok -s msstore
```

Atau unduh langsung dari [ngrok.com/download](https://ngrok.com/download).

### Autentikasi

Daftar akun gratis di [ngrok.com](https://ngrok.com), lalu salin auth token dari dashboard:

```bash
ngrok config add-authtoken <YOUR_AUTH_TOKEN>
```

---

## 2. Menggunakan ngrok di Lokal

### Menjalankan Tunnel

Jalankan server aplikasi lokal Anda terlebih dahulu (misalnya di port `8000`), kemudian jalankan ngrok:

```bash
ngrok http 8000
```

ngrok akan menampilkan URL publik acak seperti:

```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:8000
```

Salin URL `https://abc123.ngrok-free.app` tersebut untuk dimasukkan ke konfigurasi Netlify.

---

## 3. Konfigurasi Project

### Clone

```bash
git clone https://github.com/degiam/ngrok.git
```

### Environment Variable

Salin file contoh untuk konfigurasi lokal:

```bash
cp .env.example .env
```

Isi file `.env`:

```env
TARGET_URL=https://abc123.ngrok-free.app
```

> **Catatan:** Pada akun ngrok gratis, URL tunnel berganti setiap kali perintah `ngrok http` dijalankan ulang. Cukup perbarui variabel `TARGET_URL` di Netlify jika URL ngrok Anda berganti.

### Struktur Folder

```
├── netlify/
│   └── functions/
│       └── server.js       # Netlify Function utama (proxy + offline fallback)
├── public/
│   ├── index.html          # Halaman offline kustom
│   └── img.avif            # Aset gambar halaman offline
├── .env.example
├── netlify.toml
└── package.json
```

---

## 4. Deploy ke Netlify

### Via Git (Direkomendasikan)

1. **Push repo ini ke GitHub / GitLab pribadi Anda.**

2. **Buka [app.netlify.com](https://app.netlify.com)** → **Add new site** → **Import an existing project**.

3. **Pilih repositori** yang sudah Anda push.

4. **Build settings** akan otomatis terdeteksi dari `netlify.toml`:
   - Build command: `npm install`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`

5. **Tambahkan Environment Variable:**
   Buka **Site configuration → Environment variables → Add a variable**:

   | Key | Value |
   |-----|-------|
   | `TARGET_URL` | `https://abc123.ngrok-free.app` (URL ngrok aktif Anda) |

6. Klik **Deploy site**.

Setiap kali Anda melakukan `git push` ke branch utama, Netlify akan otomatis men-deploy versi terbaru.

### Via Netlify CLI (Opsional)

Jika ingin deploy langsung dari terminal:

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login ke akun Netlify
netlify login

# Deploy ke production
netlify deploy --build --prod
```

### Memperbarui TARGET_URL

Ketika ngrok di komputer lokal Anda dijalankan ulang dan mendapatkan URL tunnel baru:

1. Buka **Netlify Dashboard** → **Site configuration → Environment variables**.
2. Ubah nilai `TARGET_URL` dengan URL ngrok baru.
3. Buka tab **Deploys** → klik **Trigger deploy → Deploy site** agar Netlify memuat URL baru tersebut.

---

## 5. Menghubungkan Custom Domain via Cloudflare DNS

Inilah langkah inti agar Anda bisa mengakses ngrok lokal menggunakan domain pribadi:

### Langkah A — Tambahkan Domain di Netlify

1. Buka **Site configuration → Domain management → Add a domain**.
2. Masukkan subdomain atau domain Anda, misalnya: `ngrok.domainanda.com`.
3. Netlify akan menampilkan alamat DNS default, misalnya:
   ```
   your-site-name.netlify.app
   ```
   Salin alamat tersebut.

### Langkah B — Tambahkan DNS Record di Cloudflare

1. Login ke **[dash.cloudflare.com](https://dash.cloudflare.com)** dan pilih domain Anda.
2. Buka menu **DNS → Records → Add record**.
3. Tambahkan CNAME record:

   **Untuk Subdomain** (contoh: `ngrok.domainanda.com`):
   | Type | Name | Content | Proxy status |
   |------|------|---------|--------------|
   | `CNAME` | `ngrok` | `your-site-name.netlify.app` | ☁️ Proxied |

   **Untuk Apex / Root Domain** (contoh: `domainanda.com`):
   | Type | Name | Content | Proxy status |
   |------|------|---------|--------------|
   | `CNAME` | `@` | `your-site-name.netlify.app` | ☁️ Proxied |

4. Klik **Save**.

> **Tips Cloudflare SSL:** Jika menggunakan status **Proxied** (awan oranye), pastikan di menu **SSL/TLS → Overview** Cloudflare diatur ke mode **Full** atau **Full (Strict)** agar tidak terjadi kendala *redirect loop* (ERR_TOO_MANY_REDIRECTS).

### Langkah C — Verifikasi di Netlify

1. Kembali ke **Netlify → Domain management**.
2. Tunggu beberapa saat hingga status domain berubah menjadi **Active**.
3. Netlify akan secara otomatis menerbitkan sertifikat SSL gratis via Let's Encrypt.
4. Selesai! Sekarang Anda dapat mengakses tunnel ngrok lokal langsung melalui `https://ngrok.domainanda.com`.

---

## Troubleshooting

### Gambar offline tidak muncul di halaman fallback
Pastikan opsi `binary: ['image/*']` sudah diaktifkan pada konfigurasi `serverless-http` di `server.js` agar file biner (AVIF, WebP, PNG) dikirim dengan benar. Jika baru saja deploy, lakukan:
**Deploys → Trigger deploy → Clear cache and deploy site**.

### Semua rute menampilkan error page ngrok, bukan halaman offline
Pastikan logika rute di `server.js` sudah mendeteksi path direktori (seperti `/template/` atau `/about`), bukan hanya file yang berakhiran `.html` dan `.php`.

### TARGET_URL sudah diubah tapi traffic masih mengarah ke URL lama
Netlify Functions memuat environment variable saat build/deploy. Pastikan Anda melakukan **Trigger deploy ulang** setiap kali selesai mengedit nilai `TARGET_URL`.
