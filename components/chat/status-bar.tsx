"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, X, Send, Mic, Square, ImageIcon, Type, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Profile, StatusGroup } from "@/lib/types";
import { useStatuses } from "@/hooks/use-status";
import { StatusViewer } from "./status-viewer";

// ── Text status background palette ────────────────────────────────────────────

const BG_OPTIONS = [
  { bg: "#075E54", text: "#FFFFFF" },
  { bg: "#128C7E", text: "#FFFFFF" },
  { bg: "#25D366", text: "#111111" },
  { bg: "#34B7F1", text: "#FFFFFF" },
  { bg: "#FF6B6B", text: "#FFFFFF" },
  { bg: "#6C5CE7", text: "#FFFFFF" },
  { bg: "#E17055", text: "#FFFFFF" },
  { bg: "#2D3436", text: "#FFFFFF" },
  { bg: "linear-gradient(135deg,#667eea,#764ba2)", text: "#FFFFFF" },
  { bg: "linear-gradient(135deg,#f093fb,#f5576c)", text: "#FFFFFF" },
  { bg: "linear-gradient(135deg,#4facfe,#00f2fe)", text: "#FFFFFF" },
  { bg: "linear-gradient(135deg,#43e97b,#38f9d7)", text: "#111111" },
];

// ── StatusCreator modal ────────────────────────────────────────────────────────

type CreatorTab = "text" | "media" | "audio";

interface CreatorProps {
  onClose: () => void;
  onPostText: (text: string, bg: string, textColor: string) => Promise<void>;
  onPostMedia: (file: File, type: "image" | "video", caption?: string, dur?: number) => Promise<void>;
  onPostAudio: (blob: Blob, dur: number) => Promise<void>;
  uploading: boolean;
}

function StatusCreator({ onClose, onPostText, onPostMedia, onPostAudio, uploading }: CreatorProps) {
  const [tab, setTab] = useState<CreatorTab>("text");

  // Text state
  const [statusText, setStatusText] = useState("");
  const [bgIdx, setBgIdx] = useState(0);

  // Media state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [caption, setCaption] = useState("");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef("audio/webm");
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const selected = BG_OPTIONS[bgIdx];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setMediaError(null);

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) { setMediaError("Only images and videos are allowed."); return; }
    if (file.size > 50 * 1024 * 1024) { setMediaError("File must be under 50 MB."); return; }

    if (isVideo) {
      // Check duration via a temp video element
      const vid = document.createElement("video");
      vid.preload = "metadata";
      const url = URL.createObjectURL(file);
      vid.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (vid.duration > 30) {
          setMediaError("Video must be 30 seconds or less.");
          return;
        }
        setVideoDuration(Math.ceil(vid.duration));
        setMediaFile(file);
        setMediaType("video");
        setMediaPreview(URL.createObjectURL(file));
      };
      vid.src = url;
    } else {
      setMediaFile(file);
      setMediaType("image");
      setMediaPreview(URL.createObjectURL(file));
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/ogg;codecs=opus", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      const mime = preferred.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      mimeRef.current = mime || "audio/webm";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start(200);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch { /* mic denied */ }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const cancelAudio = useCallback(() => {
    recorderRef.current?.stop();
    setIsRecording(false);
    setAudioBlob(null);
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    setRecordingTime(0);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioPreviewRef.current) return;
    if (isPlaying) { audioPreviewRef.current.pause(); } else { audioPreviewRef.current.play(); }
    setIsPlaying(!isPlaying);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const canSubmit = tab === "text" ? statusText.trim().length > 0
    : tab === "media" ? !!mediaFile
    : !!audioBlob;

  const handleSubmit = async () => {
    if (!canSubmit || uploading) return;
    if (tab === "text") {
      await onPostText(statusText.trim(), selected.bg, selected.text);
    } else if (tab === "media" && mediaFile) {
      await onPostMedia(mediaFile, mediaType, caption.trim() || undefined, videoDuration || undefined);
    } else if (tab === "audio" && audioBlob) {
      await onPostAudio(audioBlob, recordingTime);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="font-semibold text-lg text-foreground">Add Status</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(["text", "media", "audio"] as CreatorTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors",
                tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "text" && <Type className="h-4 w-4" />}
              {t === "media" && <ImageIcon className="h-4 w-4" />}
              {t === "audio" && <Mic className="h-4 w-4" />}
              <span className="capitalize">{t === "media" ? "Photo/Video" : t}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Text tab ──────────────────────────────────────────────────── */}
          {tab === "text" && (
            <>
              {/* Live preview */}
              <div
                className="w-full aspect-[9/14] rounded-2xl flex items-center justify-center overflow-hidden relative"
                style={{ background: selected.bg }}
              >
                <p
                  className="text-center font-semibold text-xl px-8 break-words leading-snug max-w-xs"
                  style={{ color: selected.text }}
                >
                  {statusText || "What's on your mind?"}
                </p>
              </div>
              {/* Background picker */}
              <div className="flex flex-wrap gap-2">
                {BG_OPTIONS.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setBgIdx(i)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform",
                      bgIdx === i ? "border-primary scale-110 shadow-md" : "border-transparent"
                    )}
                    style={{ background: opt.bg }}
                  />
                ))}
              </div>
              {/* Text input */}
              <textarea
                value={statusText}
                onChange={(e) => setStatusText(e.target.value.slice(0, 700))}
                placeholder="Type something..."
                rows={3}
                className="w-full resize-none rounded-xl bg-secondary px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-xs text-muted-foreground text-right">{statusText.length}/700</p>
            </>
          )}

          {/* ── Media tab ─────────────────────────────────────────────────── */}
          {tab === "media" && (
            <>
              {!mediaFile ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 hover:bg-secondary/50 transition-colors"
                >
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Tap to pick a photo or video</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Images or videos up to 30s / 50 MB</p>
                  </div>
                </button>
              ) : (
                <div className="relative rounded-2xl overflow-hidden">
                  {mediaType === "image"
                    ? <img src={mediaPreview!} alt="Preview" className="w-full max-h-72 object-cover" />
                    : <video src={mediaPreview!} className="w-full max-h-72 object-cover" controls />
                  }
                  <button
                    onClick={() => { setMediaFile(null); setMediaPreview(null); setMediaError(null); }}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {mediaError && (
                <p className="text-sm text-red-500 font-medium">{mediaError}</p>
              )}
              {mediaFile && (
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a caption..."
                  rows={2}
                  className="w-full resize-none rounded-xl bg-secondary px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              )}
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
            </>
          )}

          {/* ── Audio tab ─────────────────────────────────────────────────── */}
          {tab === "audio" && (
            <div className="flex flex-col items-center gap-5 py-4">
              {!audioBlob ? (
                <>
                  <div className={cn(
                    "h-28 w-28 rounded-full flex items-center justify-center transition-all",
                    isRecording ? "bg-red-500/20 ring-4 ring-red-500/40 animate-pulse" : "bg-secondary"
                  )}>
                    {isRecording
                      ? <div className="flex items-end gap-0.5 h-10">
                          {[3, 6, 4, 8, 5, 7, 3, 6].map((h, i) => (
                            <div key={i} className="w-1.5 rounded-full bg-red-500 animate-bounce"
                              style={{ height: `${h * 4}px`, animationDelay: `${i * 80}ms` }} />
                          ))}
                        </div>
                      : <Mic className="h-10 w-10 text-muted-foreground" />
                    }
                  </div>
                  {isRecording && (
                    <p className="text-2xl font-mono font-semibold text-foreground tabular-nums">{fmt(recordingTime)}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {isRecording ? "Recording… tap stop when done" : "Tap to record an audio status (max 60s)"}
                  </p>
                  <div className="flex gap-3">
                    {isRecording ? (
                      <>
                        <button onClick={cancelAudio} className="px-5 py-2.5 rounded-full bg-secondary text-sm font-medium hover:bg-secondary/80">
                          Cancel
                        </button>
                        <button
                          onClick={stopRecording}
                          disabled={recordingTime < 1}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50"
                        >
                          <Square className="h-4 w-4 fill-current" />
                          Stop
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={startRecording}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                      >
                        <Mic className="h-4 w-4" />
                        Start Recording
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="h-24 w-24 rounded-full flex items-center justify-center bg-primary/20">
                    <Mic className="h-10 w-10 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">Audio status · {fmt(recordingTime)}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={togglePlay}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-sm font-medium"
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {isPlaying ? "Pause" : "Preview"}
                    </button>
                    <button onClick={cancelAudio} className="px-4 py-2 rounded-full bg-secondary text-sm text-muted-foreground">
                      Redo
                    </button>
                  </div>
                  {audioUrl && (
                    <audio ref={audioPreviewRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="hidden" />
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="px-5 pb-6 pt-3 border-t">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || uploading}
            className={cn(
              "w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold transition-colors",
              canSubmit && !uploading
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            )}
          >
            {uploading
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <><Send className="h-4 w-4" /> Post Status</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ring helper ────────────────────────────────────────────────────────────────

function StatusRing({ hasUnviewed, hasAny, size = 56 }: { hasUnviewed: boolean; hasAny: boolean; size?: number }) {
  if (!hasAny) return null;
  return (
    <svg
      width={size + 6}
      height={size + 6}
      className="absolute -inset-[3px]"
      style={{ transform: "rotate(-90deg)" }}
    >
      <circle
        cx={(size + 6) / 2}
        cy={(size + 6) / 2}
        r={size / 2}
        fill="none"
        stroke={hasUnviewed ? "#22c55e" : "#6b7280"}
        strokeWidth={2.5}
        strokeDasharray={hasUnviewed ? undefined : "4 3"}
      />
    </svg>
  );
}

// ── StatusBar (exported) ──────────────────────────────────────────────────────

interface StatusBarProps {
  userId?: string;
  profile?: Profile | null;
}

export function StatusBar({ userId, profile }: StatusBarProps) {
  const {
    myStatuses,
    statusGroups,
    viewedIds,
    uploading,
    postText,
    postMedia,
    postAudio,
    deleteStatus,
    markViewed,
    getViewers,
  } = useStatuses(userId);

  const [showCreator, setShowCreator]       = useState(false);
  const [viewingGroup, setViewingGroup]     = useState<StatusGroup | null>(null);
  const [viewingMine, setViewingMine]       = useState(false);

  if (!userId) return null;

  const myProfile: Profile = profile ?? {
    id: userId,
    display_name: "Me",
    avatar_initials: "ME",
    is_online: true,
    created_at: "",
    updated_at: "",
  };

  const hasMyStatus = myStatuses.length > 0;
  const allMyViewed = hasMyStatus && myStatuses.every((s) => viewedIds.has(s.id));

  return (
    <>
      <div className="border-b bg-card">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex items-start gap-1 px-3 py-3" style={{ minWidth: "max-content" }}>

            {/* My status */}
            <button
              onClick={() => hasMyStatus ? setViewingMine(true) : setShowCreator(true)}
              className="flex flex-col items-center gap-1.5 w-16 group"
            >
              <div className="relative h-14 w-14">
                <StatusRing hasUnviewed={hasMyStatus && !allMyViewed} hasAny={hasMyStatus} size={56} />
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="bg-primary/20 text-primary text-base font-semibold">
                    {myProfile.avatar_initials}
                  </AvatarFallback>
                </Avatar>
                {!hasMyStatus && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-primary border-2 border-card flex items-center justify-center">
                    <Plus className="h-3 w-3 text-white" />
                  </span>
                )}
                {hasMyStatus && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-secondary border-2 border-card flex items-center justify-center">
                    <Plus className="h-2.5 w-2.5 text-muted-foreground" />
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors leading-tight text-center">
                My status
              </span>
            </button>

            {/* Contact statuses */}
            {statusGroups.map((group) => (
              <button
                key={group.user_id}
                onClick={() => setViewingGroup(group)}
                className="flex flex-col items-center gap-1.5 w-16 group"
              >
                <div className="relative h-14 w-14">
                  <StatusRing hasUnviewed={group.unviewed_count > 0} hasAny size={56} />
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="bg-primary/20 text-primary text-base font-semibold">
                      {group.profile.avatar_initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors leading-tight text-center w-full truncate px-1">
                  {group.profile.display_name.split(" ")[0]}
                </span>
              </button>
            ))}

            {/* Placeholder when no one has a status */}
            {statusGroups.length === 0 && (
              <div className="flex items-center px-2 text-xs text-muted-foreground self-center">
                No recent statuses
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Creator modal */}
      {showCreator && (
        <StatusCreator
          onClose={() => setShowCreator(false)}
          onPostText={async (t, bg, tc) => { await postText(t, bg, tc); setShowCreator(false); }}
          onPostMedia={async (f, type, cap, dur) => { await postMedia(f, type, cap, dur); setShowCreator(false); }}
          onPostAudio={async (b, dur) => { await postAudio(b, dur); setShowCreator(false); }}
          uploading={uploading}
        />
      )}

      {/* Viewer — other people */}
      {viewingGroup && (
        <StatusViewer
          group={viewingGroup}
          viewedIds={viewedIds}
          onClose={() => setViewingGroup(null)}
          onViewed={markViewed}
          myUserId={userId}
        />
      )}

      {/* Viewer — my own statuses */}
      {viewingMine && (
        <StatusViewer
          group={{ user_id: userId, profile: myProfile, statuses: myStatuses, unviewed_count: 0 }}
          viewedIds={viewedIds}
          onClose={() => setViewingMine(false)}
          onViewed={markViewed}
          myUserId={userId}
          onDelete={deleteStatus}
          getViewers={getViewers}
        />
      )}
    </>
  );
}
