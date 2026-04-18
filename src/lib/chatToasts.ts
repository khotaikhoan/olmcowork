import { toast } from "sonner";

export type ToastActionHandlers = {
  onOpenSettings?: () => void;
  onRetryConnection?: () => void;
};

/** Toast lỗi kèm Cài đặt + (tuỳ chọn) Thử kết nối lại — dùng cho Ollama/OpenAI stream. */
export function toastStreamError(title: string, handlers?: ToastActionHandlers) {
  toast.error(title, {
    duration: 10_000,
    ...(handlers?.onOpenSettings
      ? { action: { label: "Cài đặt", onClick: handlers.onOpenSettings } }
      : {}),
    ...(handlers?.onRetryConnection
      ? { cancel: { label: "Thử lại", onClick: handlers.onRetryConnection } }
      : {}),
  });
}
