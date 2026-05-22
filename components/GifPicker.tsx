"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";

interface GifPickerProps {
  onGifSelect: (gifUrl: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

// Using Tenor API - you'll need to get a free API key from https://developers.google.com/tenor/guides/quickstart
const TENOR_API_KEY =
  process.env.NEXT_PUBLIC_TENOR_API_KEY || "YOUR_TENOR_API_KEY";

interface TenorGif {
  id: string;
  title: string;
  media_formats: {
    gif?: { url: string; dims: number[] };
    tinygif?: { url: string; dims: number[] };
    nanogif?: { url: string; dims: number[] };
  };
}

export default function GifPicker({
  onGifSelect,
  isOpen,
  onClose,
}: GifPickerProps) {
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
      // Use 'click' instead of 'mousedown' so the GIF button's click handler runs first
      // This prevents the picker from closing before the GIF is selected
      document.addEventListener("click", handleClickOutside);
      fetchTrendingGifs();
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const fetchTrendingGifs = async () => {
    if (!TENOR_API_KEY || TENOR_API_KEY === "YOUR_TENOR_API_KEY") {
      console.warn("Tenor API key not configured");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(
        "https://tenor.googleapis.com/v2/featured",
        {
          params: {
            key: TENOR_API_KEY,
            limit: 20,
            media_filter: "gif",
          },
        }
      );
      setGifs(response.data.results || []);
    } catch (error) {
      console.error("Error fetching GIFs:", error);
    } finally {
      setLoading(false);
    }
  };

  const searchGifs = async (query: string) => {
    if (!TENOR_API_KEY || TENOR_API_KEY === "YOUR_TENOR_API_KEY") {
      return;
    }

    if (!query.trim()) {
      fetchTrendingGifs();
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(
        "https://tenor.googleapis.com/v2/search",
        {
          params: {
            q: query,
            key: TENOR_API_KEY,
            limit: 20,
            media_filter: "gif",
          },
        }
      );
      setGifs(response.data.results || []);
    } catch (error) {
      console.error("Error searching GIFs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    const timeoutId = setTimeout(() => searchGifs(query), 500);
    return () => clearTimeout(timeoutId);
  };

  const getGifUrl = (gif: TenorGif): string => {
    // Prefer gif format, fallback to tinygif or nanogif
    return (
      gif.media_formats.gif?.url ||
      gif.media_formats.tinygif?.url ||
      gif.media_formats.nanogif?.url ||
      ""
    );
  };

  const getThumbnailUrl = (gif: TenorGif): string => {
    // Use tinygif or nanogif for thumbnails
    return (
      gif.media_formats.tinygif?.url ||
      gif.media_formats.nanogif?.url ||
      gif.media_formats.gif?.url ||
      ""
    );
  };

  if (!isOpen) return null;

  if (!TENOR_API_KEY || TENOR_API_KEY === "YOUR_TENOR_API_KEY") {
    return (
      <div
        ref={pickerRef}
        className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50 w-80"
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Please configure NEXT_PUBLIC_TENOR_API_KEY in your .env.local file
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Get a free API key from{" "}
          <a
            href="https://developers.google.com/tenor/guides/quickstart"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            developers.google.com/tenor
          </a>
        </p>
      </div>
    );
  }

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 w-80 h-96 flex flex-col"
    >
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search GIFs..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400 text-sm">
              Loading GIFs...
            </div>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400 text-sm">
              No GIFs found
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif) => {
              const gifUrl = getGifUrl(gif);
              const thumbnailUrl = getThumbnailUrl(gif);

              if (!gifUrl) return null;

              return (
                <button
                  key={gif.id}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent event from bubbling to document click handler
                    onGifSelect(gifUrl);
                    onClose();
                  }}
                  className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity bg-gray-100 dark:bg-gray-700"
                  title={gif.title}
                >
                  <img
                    src={thumbnailUrl}
                    alt={gif.title || "GIF"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
