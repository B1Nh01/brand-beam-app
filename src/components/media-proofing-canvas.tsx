import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { MediaAnnotation } from "@/lib/content";
import {
  CheckCircle2,
  Circle,
  MessageSquare,
  Play,
  Pause,
  RotateCcw,
  X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────

export type AnnotationInput = {
  x: number;
  y: number;
  body: string;
  timestampSeconds?: number;
};

interface Props {
  mediaId: string;
  src: string;
  type: "image" | "video";
  annotations: MediaAnnotation[];
  isPortal?: boolean;
  onAdd: (input: AnnotationInput) => Promise<void>;
  onResolve?: (id: string) => Promise<void>;
  onReopen?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ── Sub-components ────────────────────────────────────────────────

interface PinProps {
  index: number;
  annotation: MediaAnnotation;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
  onResolve?: () => void;
  onReopen?: () => void;
  onDelete?: () => void;
  isPortal: boolean;
}

function PinMarker({ index, annotation, isActive, onActivate, onClose, onResolve, onReopen, onDelete, isPortal }: PinProps) {
  const resolved = annotation.resolved;

  return (
    <div
      className="absolute"
      style={{
        left: `${annotation.x_position}%`,
        top: `${annotation.y_position}%`,
        transform: "translate(-50%, -50%)",
        zIndex: isActive ? 30 : 20,
      }}
    >
      {/* Pin circle */}
      <button
        onClick={(e) => { e.stopPropagation(); isActive ? onClose() : onActivate(); }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-lg ring-2 ring-white transition-transform",
          resolved ? "bg-gray-400 hover:scale-110" : "bg-primary hover:scale-110",
          isActive && "scale-125 ring-primary",
        )}
        title={annotation.body}
      >
        {resolved ? "✓" : index + 1}
      </button>

      {/* Popover detail */}
      {isActive && (
        <div
          className="absolute z-40 w-64 rounded-xl border bg-card p-3 shadow-xl"
          style={{ top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground">
              #{index + 1} · {annotation.author_type === "team" ? "Equipe" : (annotation.author_name ?? "Cliente")}
              {annotation.timestamp_seconds != null && (
                <span className="ml-1 rounded bg-muted px-1 font-mono">
                  {fmtTime(annotation.timestamp_seconds)}
                </span>
              )}
            </span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="mb-2 text-sm leading-snug">{annotation.body}</p>
          <div className="flex gap-1.5">
            {!isPortal && !resolved && onResolve && (
              <Button size="sm" variant="outline" className="h-6 gap-1 text-xs" onClick={onResolve}>
                <CheckCircle2 className="h-3 w-3 text-green-500" /> Resolver
              </Button>
            )}
            {!isPortal && resolved && onReopen && (
              <Button size="sm" variant="outline" className="h-6 gap-1 text-xs" onClick={onReopen}>
                <RotateCcw className="h-3 w-3" /> Reabrir
              </Button>
            )}
            {onDelete && !isPortal && (
              <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs text-destructive hover:text-destructive" onClick={onDelete}>
                <X className="h-3 w-3" /> Excluir
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Video player with annotation support ──────────────────────────

interface VideoProofProps {
  src: string;
  annotations: MediaAnnotation[];
  onClickFrame: (x: number, y: number, ts: number) => void;
  activePinId: string | null;
  onSeekToAnnotation: (ts: number) => void;
}

function VideoProofPlayer({ src, annotations, onClickFrame, activePinId: _, onSeekToAnnotation }: VideoProofProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onMeta = () => setDuration(v.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    playing ? v.pause() : v.play();
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || playing) { togglePlay(); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onClickFrame(x, y, v.currentTime);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    v.currentTime = ratio * duration;
  };

  const timedAnnotations = annotations.filter((a) => a.timestamp_seconds != null);

  return (
    <div className="flex flex-col">
      {/* Video frame */}
      <div
        className={cn(
          "relative cursor-pointer select-none overflow-hidden rounded-t-lg bg-black",
          !playing && "cursor-crosshair",
        )}
        onClick={handleVideoClick}
      >
        <video
          ref={videoRef}
          src={src}
          className="block w-full"
          preload="metadata"
        />
        {/* "Click to annotate" hint when paused */}
        {!playing && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[10px] text-white/80">
            Clique para adicionar anotação
          </div>
        )}
      </div>

      {/* Custom controls */}
      <div className="rounded-b-lg border-x border-b bg-card px-3 pb-2 pt-1.5">
        {/* Progress bar with annotation markers */}
        <div
          ref={progressRef}
          className="relative mb-1.5 h-2 cursor-pointer rounded-full bg-muted"
          onClick={handleProgressClick}
        >
          {/* Played fill */}
          <div
            className="h-full rounded-full bg-primary transition-none"
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
          />
          {/* Annotation markers */}
          {timedAnnotations.map((a) => (
            <button
              key={a.id}
              className={cn(
                "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow transition-transform hover:scale-125",
                a.resolved ? "bg-gray-400" : "bg-amber-400",
              )}
              style={{ left: `${duration > 0 ? (a.timestamp_seconds! / duration) * 100 : 0}%` }}
              title={a.body}
              onClick={(e) => {
                e.stopPropagation();
                const v = videoRef.current;
                if (v) { v.currentTime = a.timestamp_seconds!; v.pause(); }
                onSeekToAnnotation(a.timestamp_seconds!);
              }}
            />
          ))}
        </div>

        {/* Play/pause + time */}
        <div className="flex items-center gap-2">
          <button onClick={togglePlay} className="text-foreground hover:text-primary">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="font-mono text-[10px] text-muted-foreground">
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export function MediaProofingCanvas({
  src,
  type,
  annotations,
  isPortal = false,
  onAdd,
  onResolve,
  onReopen,
  onDelete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [pulsingId, setPulsingId] = useState<string | null>(null);

  // New annotation draft state
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number; ts?: number } | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);

  // Sorted list (chronological)
  const sorted = [...annotations].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const unresolved = sorted.filter((a) => !a.resolved);
  const resolved = sorted.filter((a) => a.resolved);

  const indexOf = (id: string) => sorted.findIndex((a) => a.id === id);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activePinId) { setActivePinId(null); return; }
    if (pendingPin) { setPendingPin(null); setDraftBody(""); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPin({ x, y });
    setActivePinId(null);
  };

  const handleVideoFrameClick = (x: number, y: number, ts: number) => {
    if (activePinId) { setActivePinId(null); return; }
    if (pendingPin) { setPendingPin(null); setDraftBody(""); return; }
    setPendingPin({ x, y, ts });
    setActivePinId(null);
  };

  const submitAnnotation = async () => {
    if (!pendingPin || !draftBody.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        x: pendingPin.x,
        y: pendingPin.y,
        body: draftBody.trim(),
        timestampSeconds: pendingPin.ts,
      });
      setPendingPin(null);
      setDraftBody("");
    } finally {
      setSaving(false);
    }
  };

  const focusPin = (id: string) => {
    setActivePinId(id);
    setPulsingId(id);
    setTimeout(() => setPulsingId(null), 1200);
  };

  const seekToAnnotation = (ts: number) => {
    const found = sorted.find((a) => a.timestamp_seconds != null && Math.abs(a.timestamp_seconds - ts) < 1);
    if (found) focusPin(found.id);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Media area ── */}
      <div className="relative flex min-w-0 flex-1 items-start justify-center overflow-auto bg-muted/20 p-3">
        {type === "image" ? (
          <div
            ref={containerRef}
            className="relative w-full cursor-crosshair select-none"
            onClick={handleImageClick}
          >
            <img src={src} alt="mídia" className="block w-full rounded-lg" draggable={false} />

            {/* Existing pins */}
            {sorted.map((a, i) => (
              <PinMarker
                key={a.id}
                index={i}
                annotation={a}
                isActive={activePinId === a.id}
                onActivate={() => setActivePinId(a.id)}
                onClose={() => setActivePinId(null)}
                onResolve={onResolve ? () => { onResolve(a.id); setActivePinId(null); } : undefined}
                onReopen={onReopen ? () => { onReopen(a.id); setActivePinId(null); } : undefined}
                onDelete={onDelete ? () => { onDelete(a.id); setActivePinId(null); } : undefined}
                isPortal={isPortal}
              />
            ))}

            {/* Pending pin (draft) */}
            {pendingPin && (
              <div
                className="absolute z-40"
                style={{
                  left: `${pendingPin.x}%`,
                  top: `${pendingPin.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 text-[10px] font-bold text-white ring-2 ring-white">
                  {sorted.length + 1}
                </div>
                <div className="absolute z-50 w-56 rounded-xl border bg-card p-3 shadow-xl"
                  style={{ top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }}>
                  <Textarea
                    autoFocus
                    placeholder="Descreva o ajuste… (máx. 500 caracteres)"
                    value={draftBody}
                    maxLength={500}
                    rows={3}
                    className="mb-2 resize-none text-xs"
                    onChange={(e) => setDraftBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitAnnotation();
                      if (e.key === "Escape") { setPendingPin(null); setDraftBody(""); }
                    }}
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7 flex-1 text-xs" onClick={submitAnnotation} disabled={!draftBody.trim() || saving}>
                      {saving ? "Salvando…" : "Salvar"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setPendingPin(null); setDraftBody(""); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full" ref={containerRef}>
            <VideoProofPlayer
              src={src}
              annotations={sorted}
              onClickFrame={handleVideoFrameClick}
              activePinId={activePinId}
              onSeekToAnnotation={seekToAnnotation}
            />
            {/* Video pins overlay — rendered over the video frame */}
            {/* (video pin UI is simplified: pins appear in the list only for video) */}

            {/* Pending pin on video */}
            {pendingPin && (
              <div className="mt-2 rounded-xl border bg-card p-3 shadow-md">
                <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
                  Anotação em {fmtTime(pendingPin.ts ?? 0)}
                </p>
                <Textarea
                  autoFocus
                  placeholder="Descreva o ajuste… (máx. 500 caracteres)"
                  value={draftBody}
                  maxLength={500}
                  rows={2}
                  className="mb-2 resize-none text-xs"
                  onChange={(e) => setDraftBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitAnnotation();
                    if (e.key === "Escape") { setPendingPin(null); setDraftBody(""); }
                  }}
                />
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 flex-1 text-xs" onClick={submitAnnotation} disabled={!draftBody.trim() || saving}>
                    {saving ? "Salvando…" : "Salvar"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setPendingPin(null); setDraftBody(""); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Annotation list ── */}
      <div className="flex w-56 flex-shrink-0 flex-col border-l bg-card">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-1.5 border-b px-3 py-2.5">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">
            Anotações
          </span>
          {unresolved.length > 0 && (
            <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-bold text-primary">
              {unresolved.length}
            </span>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-px p-1.5">
            {sorted.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Clique na imagem para adicionar uma anotação.
              </p>
            )}

            {/* Unresolved first */}
            {unresolved.map((a) => {
              const idx = indexOf(a.id);
              const isPulsing = pulsingId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => focusPin(a.id)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-accent",
                    activePinId === a.id && "bg-primary/8 ring-1 ring-primary/20",
                    isPulsing && "animate-pulse",
                  )}
                >
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-muted-foreground">
                      {a.author_type === "team" ? "Equipe" : (a.author_name ?? "Cliente")}
                      {a.timestamp_seconds != null && (
                        <span className="ml-1 font-mono font-normal">{fmtTime(a.timestamp_seconds)}</span>
                      )}
                    </p>
                    <p className="line-clamp-2 text-xs">{a.body}</p>
                  </div>
                </button>
              );
            })}

            {/* Divider when both lists have items */}
            {unresolved.length > 0 && resolved.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1">
                <div className="flex-1 border-t" />
                <span className="text-[9px] text-muted-foreground">resolvidos</span>
                <div className="flex-1 border-t" />
              </div>
            )}

            {/* Resolved */}
            {resolved.map((a) => {
              const idx = indexOf(a.id);
              const isPulsing = pulsingId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => focusPin(a.id)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-lg p-2 text-left opacity-50 transition-colors hover:bg-accent hover:opacity-100",
                    activePinId === a.id && "opacity-100 bg-muted ring-1 ring-border",
                    isPulsing && "animate-pulse",
                  )}
                >
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-400 text-[9px] font-bold text-white">
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-muted-foreground">
                      {a.author_type === "team" ? "Equipe" : (a.author_name ?? "Cliente")}
                      {a.timestamp_seconds != null && (
                        <span className="ml-1 font-mono font-normal">{fmtTime(a.timestamp_seconds)}</span>
                      )}
                    </p>
                    <p className="line-clamp-2 text-xs line-through">{a.body}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Hint */}
        <div className="flex-shrink-0 border-t px-3 py-2">
          <p className="text-[9px] text-muted-foreground">
            {type === "video" ? "Pause o vídeo e clique no frame para anotar." : "Clique na imagem para posicionar uma anotação."}
          </p>
        </div>
      </div>
    </div>
  );
}
