import { useEffect, useState } from "react";
import { Upload } from "lucide-react";

interface Props {
  onDrop: (files: FileList) => void;
}

/**
 * Full-screen drag overlay. Listens for drag events on window and shows a
 * dashed border when files are being dragged over any part of the app.
 */
export function GlobalDragDrop({ onDrop }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let counter = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
      counter++;
      setActive(true);
    };
    const onDragLeave = () => {
      counter = Math.max(0, counter - 1);
      if (counter === 0) setActive(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault();
    };
    const onDropEv = (e: DragEvent) => {
      e.preventDefault();
      counter = 0;
      setActive(false);
      if (e.dataTransfer?.files?.length) onDrop(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDropEv);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDropEv);
    };
  }, [onDrop]);

  if (!active) return null;
  return (
    <div className="drag-overlay animate-fade-in">
      <div className="drag-overlay-card animate-scale-in">
        <Upload className="h-10 w-10 mx-auto text-primary mb-2" />
        <div className="font-serif font-semibold text-lg">Thả ảnh để đính kèm</div>
        <div className="text-sm text-muted-foreground">PNG, JPG, GIF, WebP…</div>
      </div>
    </div>
  );
}
