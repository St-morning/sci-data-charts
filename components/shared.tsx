import { useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModuleHeader({
  code,
  title,
  desc,
}: {
  code: string;
  title: string;
  desc: string;
}) {
  return (
    <header className="mb-6">
      <div className="mb-1 flex items-center gap-2">
        <span className="num rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {code}
        </span>
        <span className="text-xs text-muted-foreground">本地计算 · 数据不上传</span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{desc}</p>
    </header>
  );
}

export function Panel({
  title,
  aside,
  children,
  className,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      {title != null && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {aside}
        </div>
      )}
      <div className="px-5 py-4">{children}</div>
    </Card>
  );
}

export function DropZone({
  onFiles,
  accept,
  multiple,
  hint,
  compact,
}: {
  onFiles: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  hint: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-center transition-colors",
        compact ? "px-4 py-4" : "px-6 py-10",
        drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-primary/5",
      )}
    >
      <Upload className="size-5 text-muted-foreground" aria-hidden />
      <span className="text-sm font-medium">点击选择或拖拽文件到此处</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </button>
  );
}

export type CheckStatus = "pass" | "warn" | "fail" | "info";

export function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, { label: string; cls: string }> = {
    pass: { label: "通过", cls: "bg-emerald-600/12 text-emerald-700 dark:text-emerald-400" },
    warn: { label: "注意", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    fail: { label: "问题", cls: "bg-rose-600/12 text-rose-700 dark:text-rose-400" },
    info: { label: "提示", cls: "bg-sky-600/12 text-sky-700 dark:text-sky-400" },
  };
  const { label, cls } = map[status];
  return (
    <Badge variant="secondary" className={cn("shrink-0 rounded-full px-2 text-xs", cls)}>
      {label}
    </Badge>
  );
}

export function CheckItem({
  status,
  title,
  detail,
}: {
  status: CheckStatus;
  title: string;
  detail: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
      <StatusBadge status={status} />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <div className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{detail}</div>
      </div>
    </li>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <p
      className={cn(
        "rounded-md px-3 py-2 text-xs leading-relaxed",
        tone === "warn"
          ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : "bg-primary/8 text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}