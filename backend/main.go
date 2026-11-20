package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
)

const (
	maxUploadBytes = 25 << 20 // 25 MB
	defaultPort    = "4000"   // local-dev default (Railway provides PORT)
)

type serviceConfig struct {
	token  string
	chatID string
	client *http.Client
}

func (c *serviceConfig) ready() bool {
	return c.token != "" && c.chatID != ""
}

func main() {
	// Load backend/.env for local development; ignore if missing (production).
	_ = godotenv.Load()

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = defaultPort
	}

	svc := &serviceConfig{
		token:  strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN")),
		chatID: strings.TrimSpace(os.Getenv("TELEGRAM_CHAT_ID")),
		client: &http.Client{},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/process-photo", svc.handleProcessPhoto)
	mux.HandleFunc("/health", handleHealth)

	// Serve built frontend from ./dist (single-service deploy) with SPA fallback.
	handler := withCORS(spaHandler(mux, "./dist"))

	addr := ":" + port
	log.Printf("server listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{
			"status":  "error",
			"message": "Method not allowed.",
		})
		return
	}
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodGet {
		_, _ = w.Write([]byte("OK"))
	}
}

func (s *serviceConfig) handleProcessPhoto(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{
			"status":  "error",
			"message": "Method not allowed.",
		})
		return
	}
	if !s.ready() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status":  "error",
			"message": "Photo service is not configured.",
		})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)

	fileBuf, filename, contentType, caption, err := readUpload(r)
	if err != nil {
		log.Printf("process-photo upload: %v", err)
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"status":  "error",
			"message": err.Error(),
		})
		return
	}

	if err := s.forwardPhoto(fileBuf, filename, contentType, caption); err != nil {
		log.Printf("process-photo: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"status":  "error",
			"message": "Failed to process photo.",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "success",
		"message": "Photo processed successfully",
	})
}

// readUpload extracts the "file" part and optional "caption" from a multipart
// request, keeping the file contents strictly in memory (no disk writes).
func readUpload(r *http.Request) (*bytes.Buffer, string, string, string, error) {
	mr, err := r.MultipartReader()
	if err != nil {
		return nil, "", "", "", fmt.Errorf("Invalid upload request.")
	}

	var (
		fileBuf     *bytes.Buffer
		filename    string
		contentType string
		caption     string
	)

	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			var mbe *http.MaxBytesError
			if errors.As(err, &mbe) {
				return nil, "", "", "", fmt.Errorf("Photo is too large.")
			}
			return nil, "", "", "", fmt.Errorf("Invalid upload request.")
		}

		switch part.FormName() {
		case "file":
			ct := part.Header.Get("Content-Type")
			if ct == "" {
				ct = "image/png"
			}
			if !isAllowedImage(ct) {
				part.Close()
				return nil, "", "", "", fmt.Errorf("Unsupported file type.")
			}
			buf := &bytes.Buffer{}
			if _, err := io.Copy(buf, part); err != nil {
				part.Close()
				var mbe *http.MaxBytesError
				if errors.As(err, &mbe) {
					return nil, "", "", "", fmt.Errorf("Photo is too large.")
				}
				return nil, "", "", "", fmt.Errorf("Could not read uploaded file.")
			}
			fn := part.FileName()
			if fn == "" {
				fn = "photo-strip.png"
			}
			fileBuf, filename, contentType = buf, fn, ct

		case "caption":
			b, _ := io.ReadAll(io.LimitReader(part, 4096))
			caption = string(b)

		default:
			_, _ = io.Copy(io.Discard, part)
		}
		_ = part.Close()
	}

	if fileBuf == nil || fileBuf.Len() == 0 {
		return nil, "", "", "", fmt.Errorf("No image file was provided.")
	}
	return fileBuf, filename, contentType, caption, nil
}

func isAllowedImage(ct string) bool {
	mt, _, err := mime.ParseMediaType(ct)
	if err != nil {
		mt = ct
	}
	switch strings.ToLower(mt) {
	case "image/png", "image/jpeg", "image/jpg", "image/webp":
		return true
	default:
		return false
	}
}

func (s *serviceConfig) forwardPhoto(fileBuf *bytes.Buffer, filename, contentType, caption string) error {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	_ = writer.WriteField("chat_id", s.chatID)
	if strings.TrimSpace(caption) != "" {
		_ = writer.WriteField("caption", caption)
	}

	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="photo"; filename="%s"`, escapeQuotes(filename)))
	h.Set("Content-Type", contentType)
	part, err := writer.CreatePart(h)
	if err != nil {
		return err
	}
	if _, err := io.Copy(part, bytes.NewReader(fileBuf.Bytes())); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}

	// Upstream delivery endpoint; this detail is never exposed to API clients.
	endpoint := "https://api.telegram.org/bot" + s.token + "/sendPhoto"
	req, err := http.NewRequest(http.MethodPost, endpoint, &body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("upstream %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

func escapeQuotes(s string) string {
	return strings.ReplaceAll(s, `"`, "")
}

// spaHandler serves static files from distDir and falls back to index.html for
// non-API routes, but only when ./dist exists (keeps local dev unaffected).
func spaHandler(api http.Handler, distDir string) http.Handler {
	indexPath := filepath.Join(distDir, "index.html")
	hasDist := fileExists(indexPath)
	fileServer := http.FileServer(http.Dir(distDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if strings.HasPrefix(p, "/api/") || p == "/health" {
			api.ServeHTTP(w, r)
			return
		}

		if !hasDist {
			http.NotFound(w, r)
			return
		}

		// Serve a real static asset if it exists; otherwise SPA fallback.
		clean := filepath.Clean(p)
		full := filepath.Join(distDir, clean)
		if fi, err := os.Stat(full); err == nil && !fi.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, indexPath)
	})
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && isLocalOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isLocalOrigin(origin string) bool {
	return strings.HasPrefix(origin, "http://localhost") ||
		strings.HasPrefix(origin, "http://127.0.0.1") ||
		strings.HasPrefix(origin, "https://localhost") ||
		strings.HasPrefix(origin, "https://127.0.0.1")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
