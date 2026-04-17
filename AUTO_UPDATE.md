# Auto-Update Setup (electron-updater + GitHub Releases)

App desktop sẽ tự kiểm tra & cài bản mới mỗi khi khởi động (và mỗi 30 phút).
Cơ chế: app đọc file `latest-mac.yml` từ GitHub Releases mới nhất, so version,
download `.dmg/.zip` và hỏi user có muốn cài + restart không.

---

## Bước 1 — Cài dependencies trên máy (1 lần duy nhất)

```bash
npm install --save-dev electron-updater electron-builder
```

> `electron-updater` là runtime, `electron-builder` là tool đóng gói + tạo
> file `latest-mac.yml` mà updater cần đọc.

## Bước 2 — Sửa `package.json` (làm thủ công, vì Lovable không edit được lockfile)

Mở `package.json` trên máy, **đổi `version` thật sự** (vd `0.1.0` → `0.1.1` mỗi lần release),
và thêm 2 thứ:

### 2a. Thêm script

```json
"scripts": {
  ...
  "release": "vite build && electron-builder --mac --publish always"
}
```

### 2b. Thêm block `build` (cấu hình cho electron-builder)

```json
"build": {
  "appId": "com.ollamacowork.app",
  "productName": "OllamaCowork",
  "files": ["dist/**/*", "electron/**/*", "package.json"],
  "mac": {
    "target": ["dmg", "zip"],
    "category": "public.app-category.developer-tools"
  },
  "publish": {
    "provider": "github",
    "owner": "<GITHUB_USERNAME_CỦA_BẠN>",
    "repo": "<TÊN_REPO_CỦA_BẠN>"
  }
}
```

⚠️ Thay `<GITHUB_USERNAME>` và `<TÊN_REPO>` bằng giá trị thật.

## Bước 3 — Tạo GitHub Personal Access Token

1. https://github.com/settings/tokens → **Generate new token (classic)**
2. Scope: chỉ cần **`repo`** (tick toàn bộ ô repo)
3. Copy token, lưu lại

## Bước 4 — Release lần đầu

```bash
cd <project-folder>
git pull                              # lấy code mới nhất từ Lovable

# Tăng version trong package.json (vd 0.1.0 → 0.1.1)
# Rồi:
export GH_TOKEN="ghp_xxx_token_vừa_tạo"
npm run release
```

Sau ~2 phút:
- Bản build `.dmg` + `.zip` + `latest-mac.yml` được upload lên GitHub Releases
- Vào tab **Releases** trên repo, **publish** draft release mà electron-builder tạo

## Bước 5 — Cài app lần đầu

Tải `.dmg` từ GitHub Releases, kéo vào Applications, mở lên.
**Từ giờ trở đi, app sẽ tự cập nhật.**

---

## Quy trình release các lần sau

```bash
git pull                                    # code mới từ Lovable
# tăng version trong package.json (vd 0.1.1 → 0.1.2)
export GH_TOKEN="ghp_xxx"
npm run release
# → vào GitHub Releases publish draft
```

User đang chạy app cũ sẽ:
1. Khởi động app → updater check → thấy version mới
2. Background download
3. Popup "Có bản cập nhật v0.1.2 đã tải xong, cài & khởi động lại?"
4. Bấm OK → app restart với code mới

---

## Troubleshooting

- **App không tự update?** Mở DevTools, xem console log từ updater. Trong dev mode (`npm run electron:dev`) updater bị tắt — chỉ hoạt động trên file `.app` đã được package qua `npm run release`.
- **"Code signature invalid" trên macOS?** Lần đầu phải cho phép trong **System Settings → Privacy & Security → Open Anyway**. Nếu muốn không hiện cảnh báo, cần Apple Developer ID ($99/năm) và sign + notarize — bảo tôi setup nếu cần.
- **Update không chạy do repo private?** GitHub Releases public mới đọc được không cần token. Nếu repo private, user phải có `GH_TOKEN` trong env — dùng repo public cho đơn giản.
