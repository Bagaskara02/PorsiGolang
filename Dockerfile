# ====================================================
# Dockerfile Multi-Stage: Porsi. (Backend Go + Frontend Client)
# ====================================================

# Tahap 1: Kompilasi Binary Go
FROM golang:alpine AS builder
WORKDIR /app

# Pasang dependensi esensial untuk kompilasi
RUN apk add --no-cache git ca-certificates tzdata

# Salin file modul agar dependensi ter-cache
COPY backend/go.mod backend/go.sum ./backend/
WORKDIR /app/backend
RUN go mod download

# Salin seluruh kode sumber backend
WORKDIR /app
COPY backend ./backend

# Kompilasi binary statis untuk arsitektur Linux
WORKDIR /app/backend
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server .

# ----------------------------------------------------
# Tahap 2: Runtime Minimalis & Cepat Menggunakan Alpine Linux
# ----------------------------------------------------
FROM alpine:latest
WORKDIR /app

# Pasang sertifikat root SSL agar request HTTPS aman
RUN apk add --no-cache ca-certificates tzdata

# Salin file binary yang sudah di-compile
COPY --from=builder /app/server /app/server

# Salin file frontend (HTML, CSS, JS, Views) ke dalam container
COPY client /app/client

# Port default aplikasi (akan disesuaikan otomatis oleh Hostless melalui env PORT)
ENV PORT=8080
EXPOSE 8080

# Jalankan server aplikasi
CMD ["/app/server"]
