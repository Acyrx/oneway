"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Status, StatusGroup, Profile } from "@/lib/types";

export function useStatuses(userId: string | undefined) {
  const [myStatuses, setMyStatuses]     = useState<Status[]>([]);
  const [statusGroups, setStatusGroups] = useState<StatusGroup[]>([]);
  const [viewedIds, setViewedIds]       = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(false);
  const [uploading, setUploading]       = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const now = new Date().toISOString();

      const [{ data: mine }, { data: others }, { data: myViews }] = await Promise.all([
        supabase
          .from("statuses")
          .select("*")
          .eq("user_id", userId)
          .gt("expires_at", now)
          .order("created_at", { ascending: true }),
        supabase
          .from("statuses")
          .select("*")
          .neq("user_id", userId)
          .gt("expires_at", now)
          .order("created_at", { ascending: true }),
        supabase
          .from("status_views")
          .select("status_id")
          .eq("viewer_id", userId),
      ]);

      setMyStatuses(mine ?? []);

      const viewedSet = new Set<string>(myViews?.map((v) => v.status_id) ?? []);
      setViewedIds(viewedSet);

      if (!others?.length) { setStatusGroups([]); setLoading(false); return; }

      // Fetch profiles for status owners
      const ownerIds = [...new Set(others.map((s) => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_initials, is_online")
        .in("id", ownerIds);

      const profileMap = new Map<string, Profile>(
        (profiles ?? []).map((p) => [p.id, p as Profile])
      );

      // Group by user and calculate unviewed counts
      const groupMap = new Map<string, StatusGroup>();
      others.forEach((s: Status) => {
        const profile = profileMap.get(s.user_id);
        if (!profile) return;
        if (!groupMap.has(s.user_id)) {
          groupMap.set(s.user_id, { user_id: s.user_id, profile, statuses: [], unviewed_count: 0 });
        }
        const g = groupMap.get(s.user_id)!;
        g.statuses.push(s);
        if (!viewedSet.has(s.id)) g.unviewed_count++;
      });

      // Sort: unviewed first, then by most recent status
      const sorted = [...groupMap.values()].sort((a, b) => {
        if (a.unviewed_count > 0 && b.unviewed_count === 0) return -1;
        if (a.unviewed_count === 0 && b.unviewed_count > 0) return 1;
        const aT = new Date(a.statuses.at(-1)!.created_at).getTime();
        const bT = new Date(b.statuses.at(-1)!.created_at).getTime();
        return bT - aT;
      });

      setStatusGroups(sorted);
    } catch (e) {
      console.error("Status fetch error:", e);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Post text status ────────────────────────────────────────────────────────
  const postText = useCallback(async (text: string, bgColor: string, textColor: string) => {
    if (!userId) return null;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("statuses")
      .insert({ user_id: userId, type: "text", content: text, bg_color: bgColor, text_color: textColor, duration: 7 })
      .select().single();
    if (error) { console.error(error); return null; }
    await refresh();
    return data as Status;
  }, [userId, refresh]);

  // ── Post image/video status ─────────────────────────────────────────────────
  const postMedia = useCallback(async (
    file: File,
    type: "image" | "video",
    caption?: string,
    durationSecs?: number,
  ) => {
    if (!userId) return null;
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${Date.now()}.${ext}`;
    const { data: up, error: upErr } = await supabase.storage
      .from("status-media")
      .upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (upErr) { setUploading(false); console.error(upErr); return null; }
    const { data: { publicUrl } } = supabase.storage.from("status-media").getPublicUrl(up.path);
    const { data, error } = await supabase
      .from("statuses")
      .insert({ user_id: userId, type, content: publicUrl, caption, duration: type === "video" ? (durationSecs ?? 15) : 5, file_size: file.size })
      .select().single();
    setUploading(false);
    if (error) { console.error(error); return null; }
    await refresh();
    return data as Status;
  }, [userId, refresh]);

  // ── Post audio status ───────────────────────────────────────────────────────
  const postAudio = useCallback(async (blob: Blob, durationSecs: number) => {
    if (!userId) return null;
    setUploading(true);
    const supabase = createClient();
    const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
    const path = `${userId}/audio-${Date.now()}.${ext}`;
    const { data: up, error: upErr } = await supabase.storage
      .from("status-media")
      .upload(path, blob, { contentType: blob.type, cacheControl: "3600" });
    if (upErr) { setUploading(false); console.error(upErr); return null; }
    const { data: { publicUrl } } = supabase.storage.from("status-media").getPublicUrl(up.path);
    const { data, error } = await supabase
      .from("statuses")
      .insert({ user_id: userId, type: "audio", content: publicUrl, duration: durationSecs, file_size: blob.size })
      .select().single();
    setUploading(false);
    if (error) { console.error(error); return null; }
    await refresh();
    return data as Status;
  }, [userId, refresh]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const deleteStatus = useCallback(async (statusId: string) => {
    if (!userId) return;
    const supabase = createClient();
    await supabase.from("statuses").delete().eq("id", statusId).eq("user_id", userId);
    setMyStatuses((prev) => prev.filter((s) => s.id !== statusId));
  }, [userId]);

  // ── Mark viewed ─────────────────────────────────────────────────────────────
  const markViewed = useCallback(async (statusId: string) => {
    if (!userId || viewedIds.has(statusId)) return;
    const supabase = createClient();
    try {
      await supabase.from("status_views")
        .upsert({ status_id: statusId, viewer_id: userId }, { onConflict: "status_id,viewer_id", ignoreDuplicates: true });
    } catch { /* duplicate — ignore */ }
    setViewedIds((prev) => new Set([...prev, statusId]));
    setStatusGroups((prev) =>
      prev.map((g) => ({
        ...g,
        unviewed_count: g.statuses.filter((s) => !viewedIds.has(s.id) && s.id !== statusId).length,
      }))
    );
  }, [userId, viewedIds]);

  // ── Get viewers for a status (own statuses only) ────────────────────────────
  const getViewers = useCallback(async (statusId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("status_views")
      .select("viewer_id, viewed_at")
      .eq("status_id", statusId)
      .order("viewed_at", { ascending: false });
    if (!data?.length) return [];
    const ids = data.map((r) => r.viewer_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_initials")
      .in("id", ids);
    const pm = new Map((profiles ?? []).map((p) => [p.id, p]));
    return data.map((r) => ({ ...r, profile: pm.get(r.viewer_id) as Profile | undefined }));
  }, []);

  return { myStatuses, statusGroups, viewedIds, loading, uploading, refresh, postText, postMedia, postAudio, deleteStatus, markViewed, getViewers };
}
