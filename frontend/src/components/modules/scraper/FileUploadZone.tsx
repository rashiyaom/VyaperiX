import React, { useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  // FIX 1: Renamed lucide File icon to FileIcon to avoid shadowing the
  // global DOM `File` type used throughout this component.
  File as FileIcon,
  X,
  AlertCircle,
} from "lucide-react";

// FIX 2: Props now correctly reference the DOM `File` global,
// no longer shadowed by the lucide `File` import.
interface FileUploadZoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

export function FileUploadZone({
  files,
  onFilesChange,
  maxFiles = 5,
  maxSizeMB = 15,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // FIX 3: Return type is now explicit (JSX.Element), and uses FileIcon
  // (the renamed lucide icon) instead of the shadowed File.
  const getFileIcon = (filename: string): React.ReactNode => {
    const ext = filename.toLowerCase().split(".").pop() ?? "";
    if (ext === "pdf") return <FileText className="w-4 h-4 text-danger" />;
    if (["csv", "xlsx", "xls"].includes(ext))
      return <FileSpreadsheet className="w-4 h-4 text-lime-600 dark:text-lime" />;
    if (["png", "jpg", "jpeg", "webp"].includes(ext))
      return <ImageIcon className="w-4 h-4 text-violet" />;
    return <FileIcon className="w-4 h-4 text-muted-foreground" />;
  };

  // FIX 4: Parameter now correctly typed as `File[]` (DOM File),
  // with FileList converted to an array before iterating to avoid
  // the "FileList is not array-indexable in strict TS" problem.
  const validateAndAddFiles = (incoming: FileList | File[]): void => {
    setError(null);
    const validExtensions = [
      ".pdf", ".csv", ".xlsx", ".xls",
      ".txt", ".md", ".docx",
      ".png", ".jpg", ".jpeg", ".webp",
    ];

    // Convert FileList → Array once so we can use standard array methods
    const newFiles: File[] = Array.from(incoming);
    const currentFiles = [...files];

    for (const file of newFiles) {
      if (currentFiles.length >= maxFiles) {
        setError(`Maximum ${maxFiles} files allowed.`);
        break;
      }

      // FIX 5: Guard against pop() returning undefined before concatenating.
      // Without this guard, a file with no extension produces ".undefined"
      // which could incorrectly pass (or fail) the extension check.
      const rawExt = file.name.split(".").pop();
      if (!rawExt) {
        setError(`File "${file.name}" has no extension and cannot be processed.`);
        continue;
      }
      const ext = "." + rawExt.toLowerCase();

      if (!validExtensions.includes(ext)) {
        setError(
          `Unsupported file: ${file.name}. Allowed: PDF, CSV, Excel, Images, TXT, DOCX.`
        );
        continue;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File "${file.name}" exceeds the ${maxSizeMB}MB limit.`);
        continue;
      }
      // Deduplicate by name + size (same as original logic)
      if (currentFiles.some((f) => f.name === file.name && f.size === file.size)) continue;

      currentFiles.push(file);
    }

    onFilesChange(currentFiles);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only clear dragging state when leaving the zone entirely,
    // not when moving over a child element.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  // FIX 6: `dataTransfer.files` is always defined on a DragEvent
  // (it is a FileList, never null). The correct guard is checking `.length > 0`,
  // not using the optional-chain operator which implies it could be null/undefined.
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (index: number) => {
    onFilesChange(files.filter((_, idx) => idx !== index));
    setError(null);
  };

  return (
    <div className="w-full space-y-3">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="File upload zone — click or drag files here"
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={`relative border-2 border-dashed p-6 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center ${
          isDragging
            ? "border-violet bg-violet/5"
            : "border-ink/30 hover:border-violet/60 hover:bg-secondary/50 bg-secondary/20"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.csv,.xlsx,.xls,.txt,.md,.docx,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              validateAndAddFiles(e.target.files);
              // Reset so the same file can be re-added after removal
              e.target.value = "";
            }
          }}
        />

        <div className="border border-ink/40 bg-secondary p-3 mb-3">
          <UploadCloud className="w-6 h-6 text-violet" />
        </div>

        <h4 className="font-display text-sm font-extrabold uppercase tracking-tight">
          Upload Pitch Decks, Financials &amp; Product Catalogs
        </h4>
        <p className="font-mono text-xs text-muted-foreground mt-1 max-w-sm">
          Drag files here, or{" "}
          <span className="text-violet font-bold">browse</span>. Supports PDF, CSV, Excel,
          Images &amp; Text — up to {maxSizeMB}MB each, max {maxFiles} files.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {["PDF Decks", "CSV / XLSX Data", "PNG/JPG Charts", "TXT / DOCX Notes"].map((t) => (
            <span
              key={t}
              className="label-mono px-2 py-0.5 border border-ink/20 bg-paper text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 border border-danger/40 bg-danger/10 text-danger text-xs font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between label-mono text-muted-foreground">
            <span>
              Attached Documents ({files.length}/{maxFiles})
            </span>
            <span>Multi-source attribution active</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {files.map((file, idx) => (
              // FIX 7: Key uses file.name + file.size + file.lastModified to be
              // truly unique and stable — avoids index-based key issues when
              // files are removed from the middle of the list.
              <div
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="flex items-center justify-between p-2.5 border border-ink/20 bg-card hover:border-ink/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 border border-ink/15 bg-secondary shrink-0">
                    {getFileIcon(file.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium text-ink truncate">
                      {file.name}
                    </p>
                    <p className="label-mono text-muted-foreground">{formatSize(file.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(idx);
                  }}
                  className="p-1 hover:text-danger text-muted-foreground transition-colors shrink-0 ml-2"
                  title={`Remove ${file.name}`}
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
