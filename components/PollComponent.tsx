"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Poll, PollOption, PollVote } from "@/lib/types";
import { BarChart2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PollComponentProps {
  poll: Poll;
  userId: string;
}

interface PollData {
  options: PollOption[];
  votes: PollVote[];
  voteCounts: Record<string, number>;
  userVotes: string[];
}

export default function PollComponent({ poll, userId }: PollComponentProps) {
  const [pollData, setPollData] = useState<PollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  // ── Fetch options + votes ─────────────────────────────────────────────────
  async function fetchPollData() {
    const supabase = createClient();

    const [optionsRes, votesRes] = await Promise.all([
      supabase
        .from("poll_options")
        .select("*")
        .eq("poll_id", poll.id)
        .order("order_index", { ascending: true }),
      supabase.from("poll_votes").select("*").eq("poll_id", poll.id),
    ]);

    if (optionsRes.error) {
      console.error(optionsRes.error);
      return;
    }
    if (votesRes.error) {
      console.error(votesRes.error);
      return;
    }

    const options = optionsRes.data as PollOption[];
    const votes = votesRes.data as PollVote[];

    const voteCounts: Record<string, number> = {};
    const userVotes: string[] = [];

    votes.forEach((vote) => {
      voteCounts[vote.option_id] = (voteCounts[vote.option_id] || 0) + 1;
      if (vote.user_id === userId) userVotes.push(vote.option_id);
    });

    setPollData({ options, votes, voteCounts, userVotes });
    setSelectedOptions(userVotes);
    setLoading(false);
  }

  useEffect(() => {
    fetchPollData();

    // Real-time vote updates
    const supabase = createClient();
    const channel = supabase
      .channel(`poll_votes:${poll.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "poll_votes",
          filter: `poll_id=eq.${poll.id}`,
        },
        () => {
          // Refetch on any vote change
          fetchPollData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poll.id]);

  // ── Vote handler ──────────────────────────────────────────────────────────
  const handleVote = async () => {
    if (selectedOptions.length === 0 || voting || !pollData) return;
    setVoting(true);

    const supabase = createClient();

    try {
      if (!poll.allow_multiple) {
        // Single choice — delete all existing votes then insert new one
        await supabase
          .from("poll_votes")
          .delete()
          .eq("poll_id", poll.id)
          .eq("user_id", userId);

        const { error } = await supabase.from("poll_votes").insert({
          poll_id: poll.id,
          option_id: selectedOptions[0],
          user_id: userId,
        });
        if (error) throw error;
      } else {
        // Multiple choice — add newly selected, remove deselected
        const toAdd = selectedOptions.filter(
          (id) => !pollData.userVotes.includes(id)
        );
        const toRemove = pollData.userVotes.filter(
          (id) => !selectedOptions.includes(id)
        );

        if (toAdd.length > 0) {
          const { error } = await supabase.from("poll_votes").insert(
            toAdd.map((optionId) => ({
              poll_id: poll.id,
              option_id: optionId,
              user_id: userId,
            }))
          );
          if (error) throw error;
        }

        if (toRemove.length > 0) {
          const { error } = await supabase
            .from("poll_votes")
            .delete()
            .eq("poll_id", poll.id)
            .eq("user_id", userId)
            .in("option_id", toRemove);
          if (error) throw error;
        }
      }

      // Refetch to sync state
      await fetchPollData();
    } catch (err) {
      console.error("Error voting:", err);
    } finally {
      setVoting(false);
    }
  };

  const toggleOption = (optionId: string) => {
    if (poll.status === "closed" || isExpired) return;

    if (poll.allow_multiple) {
      setSelectedOptions((prev) =>
        prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId]
      );
    } else {
      setSelectedOptions([optionId]);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const totalVotes = pollData?.votes.length ?? 0;
  const hasVoted = (pollData?.userVotes.length ?? 0) > 0;
  const isExpired = poll.expires_at
    ? new Date(poll.expires_at) < new Date()
    : false;
  const isClosed = poll.status === "closed" || isExpired;

  const selectionChanged =
    hasVoted &&
    selectedOptions.length > 0 &&
    (selectedOptions.some((id) => !pollData?.userVotes.includes(id)) ||
      pollData?.userVotes.some((id) => !selectedOptions.includes(id)));

  const showVoteButton = !isClosed && (!hasVoted || selectionChanged);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-72 rounded-xl bg-card border border-border p-4 space-y-3 animate-pulse">
        <div className="h-3.5 bg-muted rounded w-3/4" />
        <div className="h-2 bg-muted rounded w-1/3" />
        <div className="space-y-2 pt-1">
          <div className="h-10 bg-muted rounded-lg" />
          <div className="h-10 bg-muted rounded-lg" />
          <div className="h-10 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-72 rounded-xl bg-card border border-border p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <BarChart2 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">
            {poll.question}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
            <span>
              {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
            </span>
            {poll.allow_multiple && <span>· Multiple choice</span>}
            {isClosed && (
              <span className="text-destructive font-medium">
                · {poll.status === "closed" ? "Closed" : "Expired"}
              </span>
            )}
            {!isClosed && poll.expires_at && (
              <span>
                · Expires {new Date(poll.expires_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2 mb-3">
        {pollData?.options.map((option) => {
          const voteCount = pollData.voteCounts[option.id] ?? 0;
          const percentage =
            totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
          const isSelected = selectedOptions.includes(option.id);
          const isUserVote = pollData.userVotes.includes(option.id);

          return (
            <button
              key={option.id}
              onClick={() => toggleOption(option.id)}
              disabled={isClosed}
              className={cn(
                "w-full text-left rounded-lg border-2 p-3 transition-all relative overflow-hidden",
                isClosed && "cursor-not-allowed",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-secondary/50 hover:border-primary/40"
              )}
            >
              {/* Progress bar background */}
              {hasVoted && (
                <div
                  className={cn(
                    "absolute inset-0 origin-left transition-all duration-500",
                    isUserVote ? "bg-primary/10" : "bg-muted/60"
                  )}
                  style={{ width: `${percentage}%` }}
                />
              )}

              <div className="relative flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground leading-snug">
                  {option.option_text}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isUserVote && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  )}
                  {hasVoted && (
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {percentage.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>

              {hasVoted && (
                <p className="relative text-[10px] text-muted-foreground mt-0.5">
                  {voteCount} {voteCount === 1 ? "vote" : "votes"}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Vote button */}
      {showVoteButton && (
        <button
          onClick={handleVote}
          disabled={selectedOptions.length === 0 || voting}
          className="w-full py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {voting && (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
          )}
          {voting
            ? hasVoted
              ? "Updating..."
              : "Voting..."
            : hasVoted
            ? "Update Vote"
            : "Vote"}
        </button>
      )}
    </div>
  );
}
