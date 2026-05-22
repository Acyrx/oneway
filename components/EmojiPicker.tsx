"use client";

import dynamic from "next/dynamic";
import { useState, useRef, useEffect } from "react";
import type { Theme } from "emoji-picker-react";

// Dynamically import emoji picker to avoid SSR issues
const Picker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface EmojiPickerProps {
  onEmojiClick: (emoji: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function EmojiPicker({
  onEmojiClick,
  isOpen,
  onClose,
}: EmojiPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div ref={pickerRef} className="absolute bottom-full right-0 mb-2 z-50">
      <div className="dark:hidden">
        <Picker
          onEmojiClick={(emojiData) => {
            onEmojiClick(emojiData.emoji);
          }}
          width={350}
          height={400}
          previewConfig={{ showPreview: false }}
          theme={"light" as Theme}
        />
      </div>
      <div className="hidden dark:block">
        <Picker
          onEmojiClick={(emojiData) => {
            onEmojiClick(emojiData.emoji);
          }}
          width={350}
          height={400}
          previewConfig={{ showPreview: false }}
          theme={"dark" as Theme}
        />
      </div>
    </div>
  );
}
