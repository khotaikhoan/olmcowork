# Auto-Release Setup (GitHub Actions + electron-updater)

Mỗi lần Lovable push code mới → GitHub Actions tự build .dmg → publish Release → app desktop tự thấy bản mới và hiện nút "Cài bản mới".

## Setup 1 lần duy nhất trên MacBook

### Bước 1 — Cài deps

```bash
cd <repo>
git pull
npm install --save-dev electron-updater electron-builder
```

### Bước 2 — Sửa `package.json`

Mở `package.json`, thêm script `release` vào block `scripts`:

```json
"release": "vite build && electron-builder --mac --publish always"
```

Thêm block `build` cùng cấp với `dependencies` (thay `<USERNAME>` và `<REPO>`):

```json
"build": {
  "appId": "com.ochat.app",
  "productName": "Ochat",
  "files": ["dist/**/*", "electron/**/*", "package.json"],
  "mac": {
    "target": ["dmg", "zip"],
    "category": "public.app-category.developer-tools"
  },
  "publish": {
    "provider": "github",
    "owner": "<USERNAME>",
    "repo": "<REPO>"
  }
}
```

### Bước 3 — Commit & push

```bash
git add package.json package-lock.json
git commit -m "setup electron-builder"
git push
```

### Bước 4 — Cấp quyền Actions ghi vào repo

1. Mở `https://github.com/<USERNAME>/<REPO>/settings/actions`
2. Cuộn xuống **Workflow permissions**
3. Chọn **Read and write permissions** → Save

### Bước 5 — Trigger build lần đầu

Vào tab **Actions** trong repo → chọn workflow **"Release Electron App"** → bấm **Run workflow**.

Đợi ~5-8 phút. Khi xong → tab **Releases** sẽ có `v0.1.1` với file `.dmg`, `.zip`, `latest-mac.yml`.

### Bước 6 — Cài app

Tải `.dmg` từ release → kéo vào Applications → mở app.
(Lần đầu macOS chặn → System Settings → Privacy & Security → Open Anyway)

---

## Từ giờ về sau (hoàn toàn tự động)

1. Bạn chat với Lovable → Lovable sửa code → push lên GitHub
2. GitHub Actions tự bump version + build + publish Release (~5 phút)
3. App desktop của bạn check mỗi 30 phút (hoặc khi khởi động) → tải bản mới về background
4. Popup hiện ra: **"Có bản v0.1.x đã tải xong, cài & restart?"** → bấm OK → xong

Bạn không cần `git pull` hay chạy lệnh gì thêm.

---

## Troubleshooting

- **Workflow fail "Resource not accessible by integration"** → chưa làm Bước 4 (cấp quyền write).
- **App không thấy update** → mở DevTools, xem console. Updater chỉ chạy trong file `.app` đã đóng gói, không chạy ở `npm run electron:dev`.
- **Muốn force check ngay** → quit app, mở lại (sẽ check ngay khi khởi động).
- **Build trên Actions chậm** → bình thường ~5-8 phút trên macos-latest. Có thể tăng tốc bằng cache node_modules (đã enable).
- **Repo private** → vẫn chạy được, nhưng user cài app cần `GH_TOKEN` env var. Để repo public cho đơn giản.
