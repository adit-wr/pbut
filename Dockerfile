# Stage 1: build the React frontend
FROM node:20-alpine AS frontend
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: build the Go backend
FROM golang:1.22-alpine AS backend
WORKDIR /app

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /server .

# Stage 3: minimal runtime image
FROM alpine:latest
WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY --from=backend /server ./server
COPY --from=frontend /app/dist ./dist

ENV PORT=8080
EXPOSE 8080

CMD ["./server"]
