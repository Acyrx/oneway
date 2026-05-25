"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Send, X, Mic, Square, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import EmojiPicker from "@/components/EmojiPicker";
import GifPicker from "@/components/GifPicker";
import { Message, Profile } from "@/lib/types";

interface MessageInputProps {
  onSend: (text: string) => void;
  onSendGif?: (gifUrl: string) => void;
  onSendFile?: (file: File) => Promise<void>;
  onSendVoiceNote?: (blob: Blob, duration: number) => Promise<void>;
  onCreateProductivity?: (type: "poll" | "task" | "calendar_event" | "reminder") => void;
  disabled?: boolean;
  isSending?: boolean;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  onTyping?: () => void;
  typingLabel?: string;
  currentUserId?: string;
  otherUser?: Profile | null;
  isGroup?: boolean;
  memberProfiles?: Profile[];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MessageInput({
  onSend,
  onSendGif,
  onSendFile,
  onSendVoiceNote,
  onCreateProductivity,
  disabled,
  isSending,
  replyingTo,
  onCancelReply,
  onTyping,
  typingLabel,
  currentUserId,
  otherUser,
  isGroup,
  memberProfiles = [],
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAnchorIdx, setMentionAnchorIdx] = useState(0);
  const [mentionHighlight, setMentionHighlight] = useState(0);

  const mentionSuggestions = mentionQuery !== null && isGroup
    ? memberProfiles
        .filter(p => p.id !== currentUserId &&
          p.display_name.toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 6)
    : [];

  const insertMention = (profile: Profile) => {
    const before = message.slice(0, mentionAnchorIdx);
    const cursor = textareaRef.current?.selectionStart ?? message.length;
    const after = message.slice(cursor);
    const newText = `${before}@${profile.display_name} ${after}`;
    setMessage(newText);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = before.length + profile.display_name.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  // File state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);

  // Voice recorder state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || disabled || isSending) return;
    onSend(trimmed);
    setMessage("");
    setMentionQuery(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Navigate @mention dropdown with keyboard
    if (mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionHighlight(h => Math.min(h + 1, mentionSuggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionHighlight(h => Math.max(h - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionSuggestions[mentionHighlight]); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    setMessage(val);

    // @mention detection
    if (isGroup && memberProfiles.length > 0) {
      const before = val.slice(0, cursor);
      const match = before.match(/@([^\s@]*)$/);
      if (match) {
        setMentionQuery(match[1]);
        setMentionAnchorIdx(cursor - match[0].length);
        setMentionHighlight(0);
      } else {
        setMentionQuery(null);
      }
    }

    // Typing indicator
    if (onTyping && val && !typingThrottleRef.current) {
      onTyping();
      typingThrottleRef.current = setTimeout(() => { typingThrottleRef.current = null; }, 2000);
    }
  };

  const handleEmojiClick = (emoji: string) => {
    setMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleGifSelect = (gifUrl: string) => {
    onSendGif?.(gifUrl);
    setShowGifPicker(false);
  };

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      setFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setFilePreviewUrl(null);
    }
    e.target.value = "";
  };

  const handleSendFile = async () => {
    if (!selectedFile || !onSendFile) return;
    setUploadingFile(true);
    setFileUploadError(null);
    try {
      await onSendFile(selectedFile);
      setSelectedFile(null);
      if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); setFilePreviewUrl(null); }
    } catch (_err) {
      setFileUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleCancelFile = () => {
    setSelectedFile(null);
    setFileUploadError(null);
    if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); setFilePreviewUrl(null); }
  };

  // ── Voice recording ───────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick the best MIME type. audio/ogg;codecs=opus (Firefox) stores proper
      // duration in the container. audio/mp4 works on Safari. Chrome falls back
      // to audio/webm, which has no duration header — we work around that by
      // using the manually-tracked recordingTime as the duration hint.
      const preferred = [
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
      ];
      const mimeType = preferred.find(t => MediaRecorder.isTypeSupported(t)) ?? "";
      mimeTypeRef.current = mimeType || "audio/webm";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        setAudioBlob(blob);
        setAudioPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };

      // timeslice=200ms: request data chunks frequently so the browser flushes
      // metadata more regularly (helps with seeking in some browsers).
      recorder.start(200);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const cancelRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setAudioBlob(null);
    if (audioPreviewUrl) { URL.revokeObjectURL(audioPreviewUrl); setAudioPreviewUrl(null); }
    setRecordingTime(0);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [audioPreviewUrl]);

  const handleSendVoiceNote = async () => {
    if (!audioBlob || !onSendVoiceNote) return;
    setUploadingVoice(true);
    await onSendVoiceNote(audioBlob, recordingTime);
    setUploadingVoice(false);
    setAudioBlob(null);
    if (audioPreviewUrl) { URL.revokeObjectURL(audioPreviewUrl); setAudioPreviewUrl(null); }
    setRecordingTime(0);
  };

  const togglePreviewPlayback = () => {
    if (!previewAudioRef.current) return;
    if (isPlayingPreview) {
      previewAudioRef.current.pause();
    } else {
      previewAudioRef.current.play();
    }
    setIsPlayingPreview(!isPlayingPreview);
  };

  const replySenderName = replyingTo
    ? replyingTo.sender_id === currentUserId
      ? "You"
      : memberProfiles.find((p) => p.id === replyingTo.sender_id)?.display_name ?? otherUser?.display_name ?? "Unknown"
    : null;

  const replyPreviewText = replyingTo
    ? replyingTo.message_type === "gif" ? "GIF"
    : replyingTo.message_type === "file" ? replyingTo.file_name || "File"
    : replyingTo.message_type === "image" ? "Photo"
    : replyingTo.message_type === "voice_note" ? "Voice note"
    : replyingTo.text?.trim() || "Message"
    : "";

  // ── Voice recording mode ──────────────────────────────────────────────────
  if (isRecording) {
    return (
      <div className="border-t bg-card p-4 pb-safe">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={cancelRecording}
            className="p-2 rounded-full hover:bg-red-100 text-red-500"
            title="Cancel"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-red-400 animate-pulse rounded-full" style={{ width: "100%" }} />
            </div>
            <span className="text-sm font-mono text-muted-foreground tabular-nums">
              {formatDuration(recordingTime)}
            </span>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600"
            title="Stop recording"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        </div>
      </div>
    );
  }

  // ── Voice note preview mode ───────────────────────────────────────────────
  if (audioBlob && audioPreviewUrl) {
    return (
      <div className="border-t bg-card p-4 pb-safe">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={cancelRecording}
            className="p-2 rounded-full hover:bg-secondary text-muted-foreground"
            title="Discard"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={togglePreviewPlayback}
            className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isPlayingPreview ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Voice note</p>
            <p className="text-xs text-muted-foreground">{formatDuration(recordingTime)}</p>
          </div>
          <Button
            type="button"
            size="icon"
            onClick={handleSendVoiceNote}
            disabled={uploadingVoice}
            className="h-10 w-10 flex-shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {uploadingVoice
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <audio
          ref={previewAudioRef}
          src={audioPreviewUrl}
          onEnded={() => setIsPlayingPreview(false)}
          className="hidden"
        />
      </div>
    );
  }

  // ── File preview mode ─────────────────────────────────────────────────────
  const filePreviewBanner = selectedFile && (
    <div className="flex items-center gap-3 px-4 py-2 bg-muted/40 border-b">
      {filePreviewUrl ? (
        <img src={filePreviewUrl} alt="preview" className="h-14 w-14 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="h-14 w-14 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
          <Paperclip className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-foreground">{selectedFile.name}</p>
        {fileUploadError ? (
          <p className="text-xs text-red-500 font-medium">{fileUploadError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
        )}
      </div>
      <button
        type="button"
        onClick={handleCancelFile}
        className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground flex-shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  // ── Default mode ──────────────────────────────────────────────────────────
  return (
    <div className="border-t bg-card pb-safe">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
        onChange={handleFileInputChange}
      />

      {/* Typing indicator */}
      {typingLabel && !selectedFile && (
        <div className="flex items-center gap-2 px-4 pt-2 pb-0">
          <div className="flex gap-0.5 items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-muted-foreground">{typingLabel}</span>
        </div>
      )}

      {/* File preview */}
      {filePreviewBanner}

      {/* Reply preview banner */}
      {replyingTo && !selectedFile && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 bg-muted/40">
          <div className="flex-1 min-w-0 border-l-4 border-primary pl-2.5 py-1 rounded-sm bg-background/60">
            <p className="text-xs font-semibold text-primary truncate">{replySenderName}</p>
            <p className="text-xs text-muted-foreground truncate">{replyPreviewText}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 hover:bg-secondary rounded-full text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex items-end gap-2">
          {/* Attachment / Send file */}
          {selectedFile ? (
            <Button
              type="button"
              size="icon"
              onClick={handleSendFile}
              disabled={uploadingFile}
              className="h-10 w-10 flex-shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {uploadingFile
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                : <Send className="h-4 w-4" />}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
          )}

          {/* Textarea */}
          {!selectedFile && (
            <div className="relative flex-1">
              {/* @mention suggestion dropdown */}
              {mentionSuggestions.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 z-50 bg-card rounded-xl shadow-xl border border-border overflow-hidden min-w-[200px]">
                  {mentionSuggestions.map((profile, i) => (
                    <button
                      key={profile.id}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); insertMention(profile); }}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors",
                        i === mentionHighlight ? "bg-primary/10 text-primary" : "hover:bg-secondary"
                      )}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold flex-shrink-0">
                        {profile.avatar_initials}
                      </span>
                      <span className="font-medium truncate">{profile.display_name}</span>
                    </button>
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onFocus={() => { setShowEmojiPicker(false); setShowGifPicker(false); }}
                placeholder={isGroup ? "Type a message, @ to mention..." : "Type a message..."}
                disabled={disabled}
                rows={1}
                className={cn(
                  "w-full resize-none rounded-2xl border-0 bg-secondary px-4 py-2.5 pr-24 text-sm",
                  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20",
                  "disabled:cursor-not-allowed disabled:opacity-50 max-h-[120px]"
                )}
              />

              {/* Emoji + GIF buttons */}
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setShowEmojiPicker((v) => !v); setShowGifPicker(false); }}
                  className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
                  title="Emoji"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowGifPicker((v) => !v); setShowEmojiPicker(false); }}
                  className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
                  title="GIF"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>

              <EmojiPicker onEmojiClick={handleEmojiClick} isOpen={showEmojiPicker} onClose={() => setShowEmojiPicker(false)} />
              <GifPicker onGifSelect={handleGifSelect} isOpen={showGifPicker} onClose={() => setShowGifPicker(false)} />
            </div>
          )}

          {/* Productivity menu */}
          {onCreateProductivity && !selectedFile && (
            <div className="relative group">
              <button type="button" className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors" title="Productivity">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </button>
              <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50">
                <div className="bg-card rounded-lg shadow-lg border border-border p-2 min-w-[180px]">
                  {([
                    { type: "poll", label: "Create Poll", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
                    { type: "task", label: "Create Task", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
                    { type: "calendar_event", label: "Create Event", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                    { type: "reminder", label: "Create Reminder", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
                  ] as const).map(({ type, label, icon }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onCreateProductivity(type)}
                      className="w-full text-left px-3 py-2 hover:bg-secondary rounded text-sm flex items-center gap-2 text-foreground transition-colors"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                      </svg>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mic button (shown when textarea is empty and no file selected) */}
          {!selectedFile && !message.trim() && onSendVoiceNote && (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              title="Record voice note"
            >
              <Mic className="h-5 w-5" />
            </button>
          )}

          {/* Send */}
          {!selectedFile && (
            <Button
              type="submit"
              size="icon"
              className={cn(
                "h-10 w-10 flex-shrink-0 rounded-full transition-all",
                message.trim()
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              disabled={!message.trim() || disabled || isSending}
            >
              {isSending
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                : <Send className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
