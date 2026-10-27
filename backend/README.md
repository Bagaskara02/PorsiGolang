# Gin Auth + GORM

Project API autentikasi, product, dan order dengan Gin, GORM, Neon PostgreSQL, bcrypt,
dan JWT HS256. Modul auth memakai Handler, Service, Repository; modul product
memakai model dan route handler. Tabel `users`, `categories`, `products`, `orders`,
dan `order_details` dibuat otomatis
lewat `AutoMigrate` ketika server dimulai.

## Menjalankan

Siapkan Go 1.25+, Git untuk mengambil repository, dan database PostgreSQL di Neon.
Driver PostgreSQL memakai pgx; compiler C tidak diperlukan. Jalankan perintah
berikut dari folder project `starter/meet-12/gin-auth`:

```bash
go mod download
cp .env.example .env
openssl rand -hex 32
```

Di Neon Dashboard, buka project lalu pilih **Connect**. Salin connection string
ke `DATABASE_URL` di `.env`. Pilih host `-pooler` untuk koneksi pooled atau host
langsung untuk koneksi direct. Contoh format, bukan kredensial aktif:

```dotenv
DATABASE_URL='postgresql://USER:PASSWORD@ep-PROJECT-pooler.REGION.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
JWT_SECRET='hasil-openssl-rand-hex-32'
PORT=8080
```

Isi `JWT_SECRET` dengan hasil `openssl rand -hex 32`, minimal 32 byte.
Jangan commit `.env`. Aplikasi otomatis membaca `.env` memakai
`github.com/joho/godotenv` sebelum membaca konfigurasi. Jalankan dari folder project:

```bash
go run .
```

Environment variable yang sudah tersedia di shell tetap diprioritaskan.
File `.env` boleh tidak ada jika konfigurasi sudah disediakan lewat environment;
kesalahan format atau kegagalan membaca file menghentikan startup.

| Variable | Wajib | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | Ya | URL PostgreSQL dengan TLS; role database perlu izin membuat/mengubah tabel untuk `AutoMigrate` |
| `JWT_SECRET` | Ya | Secret penandatangan JWT, minimal 32 byte |
| `PORT` | Tidak | Port HTTP, default `8080` |
| `TEST_DATABASE_URL` | Hanya test integrasi | URL database terpisah untuk test; tidak dipakai server |

Default server: `http://localhost:8080`. `DATABASE_URL` wajib diisi dan harus memakai
TLS (`sslmode=require`, `verify-ca`, atau `verify-full`). Gunakan `verify-full`
untuk verifikasi sertifikat dan hostname. Password dengan karakter khusus dalam
URL harus di-encode; connection string dari Neon sudah memakai format URL.

Koneksi diperiksa saat startup, dengan timeout default 10 detik. Pool dibatasi
10 koneksi aktif dan 5 idle. `PreferSimpleProtocol` menghindari cache prepared
statement pada koneksi pooler. Aplikasi berhenti jika konfigurasi, koneksi,
atau migrasi gagal; tidak ada fallback ke database lain.

## Endpoint dan middleware

Semua request melewati logger, recovery, serta pembatas body 1 MiB.
Endpoint dengan nilai header pada tabel memakai hook `MockEndpoint` di
`internal/middleware/mock.go`. Endpoint order belum memakai hook tersebut.

| Method | Endpoint | Header `X-Mock-Middleware` | Auth |
| --- | --- | --- | --- |
| GET | `/health` | `health` | Publik |
| POST | `/api/auth/register` | `auth.register` | Publik |
| POST | `/api/auth/login` | `auth.login` | Publik |
| GET | `/api/me` | `auth.me` | Bearer JWT |
| GET | `/api/public/info` | `public.info` | Publik |
| GET | `/api/private/profile` | `private.profile` | Bearer JWT |
| POST | `/api/private/products` | `private.products.create` | Bearer JWT |
| GET | `/api/private/products` | `private.products.list` | Bearer JWT |
| POST | `/api/private/orders` | Tidak ada | Bearer JWT |
| GET | `/api/private/orders` | Tidak ada | Bearer JWT |
| GET | `/api/private/orders/:id` | Tidak ada | Bearer JWT |

Modul `internal/public/routes.go` menyediakan grup `/api/public` tanpa auth.
`GET /api/public/info` mengembalikan `200` dengan:

```json
{"data":{"message":"API publik dapat diakses tanpa login"}}
```

Modul `internal/private/routes.go` menyediakan grup `/api/private` dengan
`group.Use(requireAuth)`. Semua endpoint dalam grup mewarisi middleware JWT.
`GET /api/private/profile` mengembalikan profil pengguna seperti `/api/me`:
`200` jika berhasil, `401` jika token hilang/salah/kedaluwarsa atau pengguna tidak
ditemukan, `500` jika database gagal dibaca. Request yang ditolak auth tidak
mendapat header hook karena middleware auth berjalan sebelum hook endpoint.

```bash
curl -i http://localhost:8080/api/public/info

# Tanpa token: 401
curl -i http://localhost:8080/api/private/profile

# Isi dari hasil login: 200
TOKEN='<access_token dari login>'
curl -i http://localhost:8080/api/private/profile \
  -H "Authorization: Bearer $TOKEN"
```

Tambahkan endpoint berikutnya pada grup public atau private sesuai kebutuhan auth.

`GET /health` mengembalikan `200` dengan `{"data":{"status":"ok"}}`.
Endpoint ini menunjukkan proses HTTP aktif; tidak menjalankan pemeriksaan database
baru pada tiap request.

| Endpoint | Body JSON / header wajib | Respons berhasil | Respons gagal dari handler/middleware |
| --- | --- | --- | --- |
| `POST /api/auth/register` | `name`, `email`, `password`; `Content-Type: application/json` | `201`, `data` berisi pengguna | `400` input salah, `409` email terdaftar, `500` gagal menyimpan |
| `POST /api/auth/login` | `email`, `password`; `Content-Type: application/json` | `200`, `data.access_token`, `data.token_type`, `data.expires_in` | `400` input salah, `401` kredensial salah, `500` gagal memproses |
| `GET /api/me` | `Authorization: Bearer <access_token>` | `200`, `data` berisi pengguna | `401` token hilang/salah/kedaluwarsa atau pengguna tidak ditemukan, `500` gagal membaca pengguna |
| `GET /api/private/profile` | `Authorization: Bearer <access_token>` | `200`, `data` berisi pengguna | `401` auth tidak valid, `500` gagal membaca pengguna |
| `POST /api/private/products` | `name`; `Content-Type: application/json`; Bearer JWT | `201`, `data` berisi product dan pembuat | `400` input salah, `401` auth tidak valid, `500` gagal menyimpan |
| `GET /api/private/products` | `Authorization: Bearer <access_token>` | `200`, `data` berisi array product milik pengguna | `401` auth tidak valid, `500` gagal membaca |

Nama wajib berisi teks, maksimal 100 karakter; spasi di awal/akhir dibuang.
Email wajib valid, maksimal 254 karakter. Password minimal 8 karakter dan
maksimal 72 byte. Body request dibatasi 1 MiB; body JSON terlalu besar ditolak
handler dengan `400`.

Mock hanya menambahkan header untuk menunjukkan middleware berjalan.
Tambahkan logika sebelum/sesudah `c.Next()` atau kondisi berdasarkan `name`
untuk latihan aturan tiap endpoint. Middleware `RequireAuth` memvalidasi JWT
dan mengecek pengguna di database. Mock tidak melewati validasi auth.
Route auth dan middleware terdaftar di `internal/auth/routes.go`;
route health dan perakitan dependency berada di `setupEngine` pada `main.go`.

## Contoh request

```bash
curl -i http://localhost:8080/health

curl -i -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Budi","email":"budi@example.com","password":"password123"}'

curl -i -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"budi@example.com","password":"password123"}'
```

Login mengembalikan bentuk berikut; salin `access_token` ke request profil:

```json
{"data":{"access_token":"<JWT>","token_type":"Bearer","expires_in":3600}}
```

```bash
TOKEN='<access_token dari login>'
curl -i http://localhost:8080/api/me -H "Authorization: Bearer $TOKEN"
```

Register mengembalikan `201` dan profil pengguna tanpa password/hash.
Contoh bentuk respons register dan profil (`id` dan waktu mengikuti data tersimpan):

```json
{
  "data": {
    "id": 1,
    "name": "Budi",
    "email": "budi@example.com",
    "created_at": "2026-10-20T10:00:00Z"
  }
}
```

Password minimal 8 karakter dan maksimal 72 byte; email dinormalisasi ke huruf kecil
dan dibatasi unique index. Login/profil berhasil mengembalikan `200`.
Input salah mendapat `400`, email duplikat `409`, kredensial atau token salah `401`,
dan kegagalan database `500`. Format error: `{"error":"pesan"}`.

JWT berlaku satu jam, memerlukan issuer `gin-auth`, dan hanya menerima HS256.
Untuk latihan ini belum ada refresh token atau logout server-side;
tambahkan revocation store saat membutuhkan pencabutan token sebelum kedaluwarsa.

## Relasi users dan products

Ada dua tabel: `users` dan `products`, dengan relasi **one-to-many**:
satu user bisa membuat banyak product; setiap product memiliki satu pembuat.
Model `Product` menggunakan `UserID` sebagai foreign key ke `users.id`, dan
asosiasi GORM `User`. Daftar product memakai `Preload("User")` untuk memuat pembuat.
Hash password tidak dikirim dalam JSON.

```mermaid
erDiagram
    users ||--o{ products : creates
    users {
        bigint id PK
        text name
        text email UK
        text password_hash
        timestamptz created_at
    }
    products {
        bigint id PK
        varchar name
        bigint user_id FK
        timestamptz created_at
    }
```

Saat `go run .`, `AutoMigrate` membuat tabel `products` beserta foreign key.
Kolom: `id`, `name`, `user_id`, `created_at`. Penghapusan user yang masih memiliki
product ditolak oleh constraint `ON DELETE RESTRICT`.

```bash
# TOKEN berasal dari endpoint login.
curl -i -X POST http://localhost:8080/api/private/products \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Buku Go"}'

curl -i http://localhost:8080/api/private/products \
  -H "Authorization: Bearer $TOKEN"
```

`POST` mengembalikan `201` dengan `data` berupa product beserta `user` pembuat.
Nama wajib berisi teks, maksimal 100 karakter; spasi awal/akhir dibuang.
`user_id` selalu diambil dari pengguna yang terautentikasi; nilai dari body diabaikan.
Input tidak valid mendapat `400`; kegagalan penyimpanan mendapat `500`.

Contoh respons create product:

```json
{
  "data": {
    "id": 1,
    "name": "Buku Go",
    "user_id": 1,
    "user": {
      "id": 1,
      "name": "Budi",
      "email": "budi@example.com",
      "created_at": "2026-10-20T10:00:00Z"
    },
    "created_at": "2026-10-20T10:05:00Z"
  }
}
```

Respons daftar memakai bentuk `{"data":[...]}` dengan objek product yang sama.
ID dan waktu pada contoh hanya ilustrasi.

`GET` mengembalikan `200` dengan `data` berupa array, hanya product milik pengguna
yang sedang login, maksimal 100 terbaru berdasarkan ID. Jika kosong: `{"data":[]}`.
Kegagalan membaca database mendapat `500`. Kedua endpoint mendapat `401` jika
auth tidak valid. Update/delete product belum disediakan.

## API order

Semua endpoint order wajib memakai `Authorization: Bearer <access_token>`.
Route dirakit di `main.go` dan terdaftar di `internal/orders/routes.go`.

| Method | Endpoint | Respons berhasil | Respons gagal |
| --- | --- | --- | --- |
| POST | `/api/private/orders` | `201`, `{"data":{...}}` berisi order dan detail | `400` input salah/stok kurang/total tidak valid, `401` auth tidak valid, `404` product tidak ditemukan, `500` gagal membuat order atau membaca pengguna |
| GET | `/api/private/orders` | `200`, `{"data":[...]}` berisi order pengguna login | `401` auth tidak valid, `500` gagal membaca order atau pengguna |
| GET | `/api/private/orders/:id` | `200`, `{"data":{...}}` berisi satu order pengguna login | `400` ID tidak valid, `401` auth tidak valid, `404` order tidak ditemukan atau milik pengguna lain, `500` gagal membaca order atau pengguna |

### Membuat order product

Satu request membuat satu order dengan satu atau beberapa produk.
Kirim `Content-Type: application/json` dengan body berikut:

```json
{
  "items": [
    {"product_id": 1, "quantity": 2},
    {"product_id": 2, "quantity": 1}
  ]
}
```

Untuk memesan satu produk, isi `items` dengan satu objek.

| Field | Tipe | Aturan |
| --- | --- | --- |
| `items` | array | Wajib, minimal satu item; product_id tidak boleh duplikat |
| `items[].product_id` | integer | Wajib, ID product yang sudah tersedia, lebih dari 0 |
| `items[].quantity` | integer | Wajib, minimal 1, tidak melebihi stok |

`user_id` diambil dari pengguna login. Harga diambil dari database, bukan body.
`quantity` disimpan sebagai `order_details[].qty`; `price` menyimpan harga satuan
saat pembelian. `subtotal` tiap detail = `price * qty`, sedangkan `grand_total` =
jumlah seluruh subtotal, tanpa pajak atau ongkir. Nilai yang melampaui
kapasitas tipe `int` ditolak dengan `400`, baik pada perkalian per item maupun
penjumlahan seluruh item. `items` kosong, jumlah nol/negatif, dan ID produk
duplikat juga ditolak dengan `400`.

Contoh perhitungan:

| Produk | Harga satuan | Jumlah | Subtotal |
| --- | ---: | ---: | ---: |
| Buku Go | 15000 | 2 | 30000 |
| Pensil | 5000 | 1 | 5000 |
| **Grand total** | | | **35000** |

Product dikunci berdasarkan urutan ID selama transaksi agar pembelian bersamaan
tidak menghabiskan stok yang sama. Pembuatan order, detail, dan pengurangan stok berlangsung dalam satu
transaksi; kegagalan membatalkan seluruh perubahan. Product dapat dipesan tanpa
harus dimiliki pembeli. Perubahan harga product setelah pembelian tidak mengubah
harga pada detail order. Jika salah satu produk tidak ditemukan (`404`) atau
stoknya tidak cukup (`400`), order tidak dibuat dan stok semua produk tetap utuh.

```bash
TOKEN='<access_token dari login>'

# Siapkan dua product dengan stok dan harga, lalu gunakan ID dari respons.
curl -i -X POST http://localhost:8080/api/private/products \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Buku Go","stock":10,"price":15000}'

curl -i -X POST http://localhost:8080/api/private/products \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Pensil","stock":10,"price":5000}'

# Contoh: ID Buku Go = 1 dan Pensil = 2. Sesuaikan dengan hasil create product.
curl -i -X POST http://localhost:8080/api/private/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"product_id":1,"quantity":2},{"product_id":2,"quantity":1}]}'
```

Format lama `{"product_id":1,"quantity":2}` tidak lagi diterima; gunakan `items`.
Kolom database `orders.total` tetap dipakai; nama JSON berubah menjadi `grand_total`.
Subtotal dihitung dari snapshot harga detail, sehingga order lama tetap terbaca.

Respons create, daftar, dan detail order memuat field berikut:

| Field | Keterangan |
| --- | --- |
| `data.id` | ID order |
| `data.user_id`, `data.user` | ID dan profil pembeli tanpa password/hash |
| `data.created_at` | Waktu order dibuat |
| `data.grand_total` | Jumlah subtotal semua item |
| `data.order_details[].subtotal` | Harga satuan saat pembelian × jumlah |
| `data.order_details` | Array detail order |
| `data.order_details[].id`, `order_id` | ID detail dan ID order induk |
| `data.order_details[].product_id`, `product` | ID dan objek product saat respons dibaca; objek product bukan snapshot pembelian |
| `data.order_details[].qty`, `price` | Jumlah dibeli dan harga satuan saat pembelian |

Cuplikan respons `201` berikut menghilangkan objek `user` dan `product` agar ringkas.
ID dan waktu hanya ilustrasi; contoh pembelian mengurangi stok dari 10 menjadi 8.

```json
{
  "data": {
    "id": 1,
    "user_id": 1,
    "created_at": "2026-10-21T10:00:00Z",
    "grand_total": 35000,
    "order_details": [
      {
        "id": 1,
        "order_id": 1,
        "product_id": 1,
        "qty": 2,
        "price": 15000,
        "subtotal": 30000
      },
      {
        "id": 2,
        "order_id": 1,
        "product_id": 2,
        "qty": 1,
        "price": 5000,
        "subtotal": 5000
      }
    ]
  }
}
```

### Membaca order

```bash
curl -i http://localhost:8080/api/private/orders \
  -H "Authorization: Bearer $TOKEN"

curl -i http://localhost:8080/api/private/orders/1 \
  -H "Authorization: Bearer $TOKEN"
```

Daftar hanya memuat order pengguna login, diurutkan berdasarkan ID terbaru,
tanpa pagination. Setiap elemen memiliki bentuk sama dengan respons create.
Jika kosong, respons `200` berupa `{"data":[]}`. Detail order milik pengguna lain
mengembalikan `404`, sama seperti ID yang tidak ditemukan.

Semua error memakai format `{"error":"pesan"}`. Contoh pesan dari handler order:

| Status | Kondisi | Pesan |
| --- | --- | --- |
| `400` | Body tidak valid atau field wajib tidak sesuai | `items wajib diisi; setiap item wajib memiliki product_id lebih dari 0 dan quantity minimal 1` |
| `400` | Stok kurang | `stok product tidak cukup` |
| `400` | Validasi service atau perhitungan total ditolak | `items wajib diisi; product_id dan quantity harus lebih dari 0 dan product_id tidak boleh duplikat` |
| `400` | Parameter ID order tidak valid | `ID order wajib diisi` |
| `401` | Token hilang, salah, atau kedaluwarsa | `Token tidak valid atau kedaluwarsa` |
| `404` | Product tidak ditemukan saat create | `Product tidak ditemukan` |
| `404` | Order tidak ditemukan atau bukan milik pembeli | `Order tidak ditemukan` |
| `500` | Transaksi create gagal | `Gagal membuat order` |
| `500` | Query daftar/detail gagal | `Gagal membaca order` |

Model `Order` memakai tabel `orders`; `OrderDetail` memakai `order_details`.
Relasi: `orders.user_id` ke `users.id`, `order_details.order_id` ke `orders.id`,
dan `order_details.product_id` ke `products.id`. Foreign key memakai
`ON DELETE RESTRICT`. Kedua model dimigrasikan otomatis saat startup.
API belum menyediakan update, pembatalan,
penghapusan, pembayaran, atau pengembalian stok.

## Menjalankan test

```bash
go test ./...
go vet ./...
```

Test tanpa database mencakup validasi URL/TLS, hook endpoint publik,
input tidak valid, serta penolakan token salah/kedaluwarsa.

Untuk test integrasi, buat branch/database Neon khusus test, lalu isi
`TEST_DATABASE_URL` dalam `.env` dengan connection string database tersebut.
`go test` tidak menjalankan startup server, sehingga `.env` perlu dimuat ke shell
untuk test integrasi. Jalankan pada shell Bash/Zsh, dengan file `.env` milik sendiri:

```bash
set -a
source .env
set +a
go test -v ./...
```

Test integrasi menjalankan migrasi tabel `users` dan `products`, register/login/profil,
hash password, email duplikat, serta pembacaan lewat koneksi PostgreSQL terpisah.
Test product memeriksa pembuat dari konteks auth, pemuatan relasi `User`,
pembatasan daftar per pengguna, dan foreign key yang menolak penghapusan pembuat.
Test order tanpa database memeriksa validasi body HTTP dan service, penolakan ID
produk duplikat, overflow perkalian, serta perhitungan subtotal. Test integrasi
order memeriksa pembelian beberapa produk, subtotal dan grand total pada create
dan pembacaan detail, pengurangan stok, rollback seluruh transaksi saat stok item
berikutnya kurang atau grand total overflow, serta isolasi akses antar pengguna. Data order test dibersihkan sebelum product dan pengguna.
Pengguna test memakai email unik; product dibersihkan sebelum pengguna setelah test.
Test integrasi dilewati
jika `TEST_DATABASE_URL` kosong; keberhasilan test tanpa URL bukan bukti koneksi Neon.

## Artifact project

| Artifact | Kegunaan |
| --- | --- |
| `README.md` | Panduan setup, kontrak endpoint, contoh curl, dan verifikasi |
| `.env.example` | Template konfigurasi; salin menjadi `.env` lokal |
| `go.mod`, `go.sum` | Dependency dan checksum versi yang digunakan |
| `main.go` | Load `.env`, validasi konfigurasi, migrasi GORM, dan server HTTP |
| `internal/auth/` | Model pengguna, repository GORM, bcrypt/JWT, handler, route, middleware auth |
| `internal/public/routes.go` | Grup API publik tanpa middleware auth |
| `internal/private/routes.go` | Grup API private dengan middleware auth |
| `internal/product/` | Model relasi GORM, endpoint create/list product, dan test |
| `internal/orders/` | Model Order/OrderDetail, transaksi pembelian, endpoint create/list/detail, dan test |
| `internal/database/` | Validasi URL/TLS dan pool koneksi PostgreSQL |
| `internal/middleware/mock.go` | Header hook berbeda untuk setiap endpoint |
| `*_test.go` | Unit test dan test integrasi PostgreSQL |

GORM membuat tabel `users` dengan kolom `id`, `name`, `email`, `password_hash`,
dan `created_at`; email memiliki unique index. Password disimpan sebagai hash bcrypt.
Tabel `products` terhubung lewat `products.user_id`; model dan route tersedia di
`internal/product/`, termasuk test validasi, relasi, dan pembatasan akses per user.
Migrasi kedua tabel dijalankan otomatis saat startup; tidak ada perintah migrasi terpisah.
Contoh request tersedia sebagai perintah curl di atas; project belum menyediakan
file OpenAPI/Swagger atau collection Postman.

## Struktur file

```text
gin-auth/
├── main.go              # Perakitan dependency, migrasi, server
├── main_test.go         # Test route dan integrasi PostgreSQL
├── internal/
│   ├── auth/
│   │   ├── model.go
│   │   ├── repository.go
│   │   ├── service.go
│   │   ├── service_test.go
│   │   ├── handler.go
│   │   ├── routes.go
│   │   └── middleware.go
│   ├── database/
│   │   ├── database.go      # Koneksi Neon PostgreSQL
│   │   └── database_test.go
│   ├── middleware/
│   │   └── mock.go         # Hook mock tiap endpoint
│   ├── public/
│   │   └── routes.go       # /api/public/info
│   ├── product/
│   │   ├── model.go        # Product belongs to User, foreign key user_id
│   │   ├── repository.go   # Query database
│   │   ├── service.go      # Logika bisnis
│   │   ├── handler.go      # Request/response HTTP
│   │   ├── routes.go       # POST/GET /api/private/products
│   │   └── routes_test.go  # Validasi, relasi, isolasi data, foreign key
│   ├── orders/
│   │   ├── model.go        # Order, OrderDetail, subtotal dari snapshot harga
│   │   ├── repository.go   # Transaksi banyak produk dan pengurangan stok
│   │   ├── service.go      # Validasi items dan perhitungan total
│   │   ├── handler.go      # Handler create/list/detail order
│   │   ├── routes.go       # POST/GET /api/private/orders, GET /:id
│   │   └── service_test.go # Validasi HTTP/service dan transaksi PostgreSQL
│   └── private/
│       └── routes.go       # Grup private: profile dan products, wajib JWT
├── .env.example         # DATABASE_URL, JWT_SECRET, PORT, TEST_DATABASE_URL
├── .gitignore
├── go.mod
└── go.sum
```

## Membuat tabel pada modul baru

Project memakai Gin + GORM + PostgreSQL dengan folder per fitur di `internal/`.
Modul fitur baru tetap memakai `go.mod` yang sama; tidak perlu menjalankan
`go mod init` lagi. Gunakan `internal/product/` sebagai contoh:

| File | Tanggung jawab |
| --- | --- |
| `model.go` | Struktur tabel dan relasi GORM |
| `repository.go` | Query database |
| `service.go` | Logika bisnis |
| `handler.go` | Validasi request dan response HTTP |
| `routes.go` | Pendaftaran endpoint |

Untuk membuat tabel saja, cukup tambahkan model dan daftarkan ke `AutoMigrate`.
Contoh berikut menambahkan modul `category` dengan tabel `categories`.
Contoh ini panduan; modul tersebut belum tersedia di project.

1. Buat `internal/category/model.go`:

   ```go
   package category

   import "time"

   type Category struct {
       ID        uint      `json:"id" gorm:"primaryKey"`
       Name      string    `json:"name" gorm:"not null;size:100"`
       CreatedAt time.Time `json:"created_at"`
   }
   ```

   GORM otomatis memakai nama tabel `categories` untuk model `Category`.
   `ID` menjadi primary key, `Name` wajib terisi di database (bukan `NULL`)
   dengan panjang maksimal 100 karakter, dan `CreatedAt` diisi otomatis saat
   record dibuat melalui GORM. Validasi nama kosong tetap perlu di handler
   saat menambahkan API.

2. Tambahkan import pada `main.go`:

   ```go
   "gin-auth/internal/category"
   ```

   Tambahkan model baru ke pemanggilan `AutoMigrate` yang sudah ada di `run()`:

   ```go
   if err := db.AutoMigrate(
       &auth.User{},
       &product.Product{},
       &category.Category{},
   ); err != nil {
       return fmt.Errorf("migrasi tabel gagal: %w", err)
   }
   ```

3. Pastikan `.env` berisi `DATABASE_URL` yang valid dengan TLS dan `JWT_SECRET`
   minimal 32 byte, lalu jalankan:

   ```bash
   go run .
   ```

   Saat startup, GORM membuat tabel `categories` jika belum ada pada database
   dari `DATABASE_URL`. Role database harus punya izin membuat/mengubah tabel.
   Tidak ada perintah migrasi terpisah.

Jika modul juga membutuhkan API, tambahkan repository, service, handler, dan route
mengikuti pola `internal/product/`. Rakit dependency di `setupEngine()` pada
`main.go`. Untuk endpoint private, teruskan handler ke
`internal/private/routes.go` dan daftarkan route pada grup `/api/private` yang
sudah memakai middleware autentikasi.

## Menghapus tabel lewat command GORM

Sample `cmd/drop-table/main.go` menghapus tabel `categories` menggunakan
`db.Migrator().DropTable("categories")`. Target tetap berupa nama tabel sehingga
command tetap bisa dikompilasi meskipun folder model sudah dihapus.
Untuk tabel lain, ubah nama tabel pada sample beserta pesan terkait.

**Operasi ini menghapus tabel beserta seluruh datanya pada database dari
`DATABASE_URL`. Driver PostgreSQL GORM memakai `CASCADE`, sehingga dependency
seperti foreign key dari tabel lain dan view yang bergantung juga bisa terhapus.**
Periksa database tujuan dan backup data yang masih dibutuhkan sebelum menjalankan.

1. Hapus model terkait dari `AutoMigrate` di `main.go` agar tabel tidak dibuat
   kembali saat server berjalan. Jika modul dihapus, bersihkan juga import,
   perakitan dependency, dan registrasi route terkait.
2. Siapkan `DATABASE_URL` melalui `.env` atau environment shell. Command ini
   tidak membutuhkan `JWT_SECRET` dan tidak menjalankan server maupun `AutoMigrate`.
3. Jalankan dari root project dengan konfirmasi eksplisit:

   ```bash
   go run ./cmd/drop-table -confirm
   ```

Tanpa `-confirm`, command berhenti sebelum membuka koneksi database.
Jika tabel sudah tidak ada, command tetap berhasil (`DROP TABLE IF EXISTS`).
