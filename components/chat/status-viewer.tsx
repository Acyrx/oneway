"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Eye, Trash2, Pause, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import type { Status, StatusGroup, Profile } from "@/lib/types";

interface StatusViewerProps {
  group: StatusGroup;
  viewedIds: Set<string>;
  onClose: () => void;
  onViewed: (statusId: string) => void;
  myUserId: string;
  onDelete?: (statusId: string) => void;
  getViewers?: (statusId: string) => Promise<{ viewer_id: string; viewed_at: string; profile?: Profile }[]>;
}

export function StatusViewer({
  group,
  viewedIds,
  onClose,
  onViewed,
  myUserId,
  onDelete,
  getViewers,
}: StatusViewerProps) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewers, setViewers] = useState<{ viewer_id: string; viewed_at: string; profile?: Profile }[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const current = group.statuses[idx];
  const isOwn = group.user_id === myUserId;
  const durationMs = (current?.duration ?? 5) * 1000;
  const isMedia = current?.type === "video" || current?.type === "audio";

  // Mark viewed
  useEffect(() => {
    if (!current || isOwn) return;
    if (!viewedIds.has(current.id)) onViewed(current.id);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load viewers for own statuses
  useEffect(() => {
    if (!isOwn || !current || !getViewers) return;
    getViewers(current.id).then(setViewers);
  }, [current?.id, isOwn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress timer (text + image only; video/audio driven by media events)
  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    startTimeRef.current = Date.now() - elapsedRef.current;
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / durationMs) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(intervalRef.current!);
        goNext();
      }
    }, 50);
  }, [durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setProgress(0);
    elapsedRef.current = 0;
    if (!current) return;
    if (!isMedia) {
      startTimer();
    } else {
      // Media drives its own progress via onTimeUpdate
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause / resume
  useEffect(() => {
    if (isMedia) {
      if (paused) { videoRef.current?.pause(); audioRef.current?.pause(); }
      else { videoRef.current?.play().catch(() => {}); audioRef.current?.play().catch(() => {}); }
      return;
    }
    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      elapsedRef.current = Date.now() - startTimeRef.current;
    } else {
      startTimer();
    }
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = useCallback(() => {
    if (idx < group.statuses.length - 1) {
      setIdx((i) => i + 1);
    } else {
      onClose();
    }
  }, [idx, group.statuses.length, onClose]);

  const goPrev = useCallback(() => {
    if (idx > 0) setIdx((i) => i - 1);
  }, [idx]);

  const handleMediaTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    const el = e.currentTarget;
    const dur = Number.isFinite(el.duration) ? el.duration : current.duration;
    if (!dur) return;
    setProgress((el.currentTime / dur) * 100);
  };

  const handleDelete = () => {
    if (!onDelete || !current) return;
    onDelete(current.id);
    if (group.statuses.length <= 1) { onClose(); return; }
    if (idx >= group.statuses.length - 1) setIdx((i) => i - 1);
  };

  if (!current) { onClose(); return null; }

  const timeAgo = formatDistanceToNow(new Date(current.created_at), { addSuffix: true });

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onMouseDown={() => setPaused(true)}
      onMouseUp={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 px-3 pt-3">
        {group.statuses.map((s, i) => (
          <div key={s.id} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{
                width: i < idx ? "100%" : i === idx ? `${progress}%` : "0%",
                transition: i === idx ? "none" : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-5 left-0 right-0 z-10 flex items-center gap-3 px-4 pt-3"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-white/50">
          <AvatarFallback className="bg-primary/80 text-white text-sm">
            {group.profile.avatar_initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{group.profile.display_name}</p>
          <p className="text-xs text-white/70">{timeAgo}</p>
        </div>
        {isOwn && onDelete && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={handleDelete}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center relative">
        {current.type === "text" && (
          <div
            className="w-full h-full flex items-center justify-center px-8"
            style={{ background: current.bg_color ?? "#128C7E" }}
          >
            <p
              className="text-center font-semibold text-2xl leading-snug break-words max-w-sm"
              style={{ color: current.text_color ?? "#FFFFFF" }}
            >
              {current.content}
            </p>
          </div>
        )}

        {current.type === "image" && current.content && (
          <img
            src={current.content}
            alt="Status"
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        )}

        {current.type === "video" && current.content && (
          <video
            ref={videoRef}
            src={current.content}
            className="max-w-full max-h-full object-contain"
            autoPlay
            playsInline
            onTimeUpdate={handleMediaTimeUpdate}
            onEnded={goNext}
          />
        )}

        {current.type === "audio" && current.content && (
          <div className="flex flex-col items-center gap-6">
            <div className={cn("h-24 w-24 rounded-full flex items-center justify-center bg-white/20", !paused && "animate-pulse")}>
              {paused
                ? <Play className="h-10 w-10 text-white" />
                : <div className="flex items-end gap-1 h-10">
                    {[3, 5, 8, 6, 4, 7, 5, 3].map((h, i) => (
                      <div
                        key={i}
                        className="w-1.5 rounded-full bg-white animate-bounce"
                        style={{ height: `${h * 4}px`, animationDelay: `${i * 80}ms` }}
                      />
                    ))}
                  </div>
              }
            </div>
            <p className="text-white/70 text-sm">🎤 Audio status</p>
            <audio
              ref={audioRef}
              src={current.content}
              autoPlay
              onTimeUpdate={handleMediaTimeUpdate}
              onEnded={goNext}
            />
          </div>
        )}

        {/* Caption */}
        {current.caption && (
          <div className="absolute bottom-16 left-0 right-0 px-6">
            <p className="text-white text-center text-sm bg-black/40 rounded-xl px-4 py-2 backdrop-blur-sm">
              {current.caption}
            </p>
          </div>
        )}

        {/* Navigation tap zones (invisible) */}
        <button
          className="absolute left-0 top-0 w-1/3 h-full opacity-0"
          onMouseDown={(e) => { e.stopPropagation(); goPrev(); }}
          onTouchStart={(e) => { e.stopPropagation(); goPrev(); }}
        />
        <button
          className="absolute right-0 top-0 w-1/3 h-full opacity-0"
          onMouseDown={(e) => { e.stopPropagation(); goNext(); }}
          onTouchStart={(e) => { e.stopPropagation(); goNext(); }}
        />
      </div>

      {/* Prev/Next arrows (visible on desktop) */}
      {idx > 0 && (
        <button
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
          onMouseDown={(e) => { e.stopPropagation(); goPrev(); }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {idx < group.statuses.length - 1 && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
          onMouseDown={(e) => { e.stopPropagation(); goNext(); }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* View count (own statuses) */}
      {isOwn && (
        <div
          className="absolute bottom-0 left-0 right-0 px-4 pb-6 z-10"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowViewers((v) => !v)}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <Eye className="h-4 w-4" />
            <span className="text-sm font-medium">{viewers.length} view{viewers.length !== 1 ? "s" : ""}</span>
          </button>

          {showViewers && viewers.length > 0 && (
            <div className="mt-3 bg-black/60 backdrop-blur-sm rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
              {viewers.map((v) => (
                <div key={v.viewer_id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-primary/60 text-white text-xs">
                      {v.profile?.avatar_initials ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {v.profile?.display_name ?? "Unknown"}
                    </p>
                    <p className="text-xs text-white/50">
                      {formatDistanceToNow(new Date(v.viewed_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
