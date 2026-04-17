

# Ollama Chat + Computer Use — Desktop App

Tôi sẽ build một **Electron desktop app** kết hợp web UI + bridge agent local, kết nối Ollama trên máy bạn để chat và điều khiển máy tính.

## Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────┐
│  Electron App (1 cài đặt duy nhất)              │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ React UI     │◄──►│ Main Process (Node)  │   │
│  │ (chat web)   │IPC │ = Bridge Agent       │   │
│  └──────┬───────┘    └──────────┬───────────┘   │
│         │                       │               │
└─────────┼───────────────────────┼───────────────┘
          │                       │
          ▼                       ▼
   Lovable Cloud            Máy local:
   (lưu chat)               • Ollama :11434
                            • Shell / FS
                            • Screenshot
                            • Mouse/Keyboard
                            (robotjs / nut.js)
```

## Phần 1 — Web UI (build trước, chạy được trong browser luôn)

**Layout giống Claude:**
- Sidebar trái: danh sách conversation, nút "New chat", search, settings
- Khu vực chính: messages stream với markdown, code highlight, copy button
- Input box dưới: textarea auto-resize, drag & drop file/ảnh, nút send, model selector
- Top bar: tên conversation, model đang dùng, indicator "Bridge connected ✅ / ❌"

**Tính năng chat:**
- Multi-conversation, đặt tên tự động từ tin nhắn đầu, rename, delete, search
- Model selector: fetch từ `GET /api/tags` của Ollama, dropdown live
- System prompt tùy chỉnh per-conversation (hoặc preset "Coder", "Writer", "Computer agent"…)
- Upload ảnh (cho vision models như llava, qwen2.5-vl) và file text (đính kèm vào prompt)
- Streaming token-by-token qua SSE từ Ollama
- Markdown render + syntax highlighting + nút copy code
- Stop generation, regenerate, edit message, branch conversation

## Phần 2 — Lovable Cloud (database)

Bảng:
- `conversations` (id, user_id, title, model, system_prompt, created_at)
- `messages` (id, conversation_id, role, content, tool_calls, attachments, created_at)
- `settings` (user_id, ollama_url, default_model, allowed_paths, require_confirm)

Auth email/password để sync nhiều máy.

## Phần 3 — Computer Use Tools (qua Bridge)

AI gọi tool → UI hiển thị "🔧 AI muốn chạy: `ls ~/Documents`" → bạn duyệt **Approve / Deny** (toggle "Auto-approve" cho từng loại) → bridge thực thi → trả kết quả về model.

**Tool set:**
| Tool | Mô tả | Risk |
|---|---|---|
| `read_file(path)` | Đọc file | Low |
| `write_file(path, content)` | Ghi/tạo file | High → cần confirm |
| `list_dir(path)` | List folder | Low |
| `run_shell(cmd)` | Chạy lệnh terminal | High → cần confirm |
| `screenshot()` | Chụp màn hình → gửi lại model (vision) | Medium |
| `mouse_click(x,y)` / `mouse_move` | Điều khiển chuột | High |
| `type_text(text)` / `key_press(key)` | Bàn phím | High |
| `open_app(name)` / `get_active_window()` | Quản lý app | Medium |

**An toàn:**
- Whitelist thư mục được phép truy cập (default: home, deny `/etc`, `/System`…)
- Mọi action high-risk hiện modal confirm trước khi chạy
- Activity log đầy đủ, có thể "kill switch" dừng agent
- Settings: bật/tắt từng tool

## Phần 4 — Tool calling loop với Ollama

- Dùng Ollama native tool calling (chỉ với model hỗ trợ: llama3.1, qwen2.5, mistral-nemo…)
- Loop: send messages + tools → nếu response có `tool_calls` → confirm → execute → append `tool` message → gọi lại model → lặp tới khi model trả text cuối
- Hiển thị từng bước tool call inline trong chat (collapsible)

## Phần 5 — Đóng gói Electron

- Vite build với `base: './'`
- `electron/main.cjs` mở BrowserWindow + đăng ký IPC handlers cho tất cả tools (dùng `child_process`, `fs`, `screenshot-desktop`, `@nut-tree-fork/nut-js` cho mouse/keyboard)
- Renderer gọi tools qua `window.bridge.runShell(...)` (preload script context-bridge)
- Package bằng `@electron/packager` cho macOS/Windows/Linux
- Icon, tên app, auto-launch Ollama check khi khởi động

## Lộ trình triển khai

**Giai đoạn 1 (trước, chạy trong browser):**
1. Web UI chat hoàn chỉnh + Lovable Cloud (conversations, messages, auth)
2. Kết nối Ollama qua `http://localhost:11434` với streaming
3. Model selector động, system prompt, upload ảnh

**Giai đoạn 2 (bridge mock trong browser):**
4. UI cho tool calls + approval flow (mock executor để test UX)
5. Tool calling loop với Ollama

**Giai đoạn 3 (Electron):**
6. Wrap thành Electron app, implement bridge thật (file, shell, screenshot)
7. Mouse/keyboard control + safety layers
8. Package thành installer

## Lưu ý quan trọng

- **Ollama cần bật CORS** khi chạy trong browser (giai đoạn 1): `OLLAMA_ORIGINS=* ollama serve`. Khi đóng Electron thì không cần.
- **Computer use rất rủi ro**: model nhỏ có thể chạy lệnh sai → xóa file. Bắt buộc bật confirm cho destructive actions ở giai đoạn đầu.
- **Model gợi ý**: `qwen2.5:14b` hoặc `llama3.1:8b` cho tool calling, `llava` / `qwen2.5-vl` cho screenshot vision.

Bắt đầu bằng Giai đoạn 1 (web UI + Cloud + Ollama chat) — có thể dùng được ngay trong browser, sau đó mới wrap Electron.
