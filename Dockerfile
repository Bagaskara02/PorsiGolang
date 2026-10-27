# ====================================================
# Dockerfile Multi-Stage: Porsi. (Backend Go + Frontend Client)
# ====================================================

# Tahap 1: Kompilasi Binary Go
FROM golang:alpine AS builder
WORKDIR /app

RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY main.go ./
COPY internal/ ./internal/

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server .

# Tahap 2: Runtime Minimalis
FROM alpine:latest
WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /app/server /app/server
COPY client /app/client

ENV PORT=8080
EXPOSE 8080

CMD ["/app/server"]
