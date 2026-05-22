"use client";

import { useState, useEffect } from "react";
import { Poll, PollOption, PollVote } from "@/lib/types";
import { BarChart3, Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface PollComponentProps {
  poll: Poll;
  userId: string;
}

interface OptionWithVotes {
  id: string;
  poll_id: string;
  option_text: string;
  order_index: number;
  votes: number;
  votedByUser: boolean;
}

export default function PollComponent({ poll, userId }: PollComponentProps) {
  const [options, setOptions] = useState<OptionWithVotes[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  const isClosed = poll.status === "closed";
  const totalVotes = options.reduce((acc, o) => acc + o.votes, 0);
  const userVotedOptionIds = options
    .filter((o) => o.votedByUser)
    .map((o) => o.id);
  const hasVoted = userVotedOptionIds.length > 0;

  // ── Fetch options + votes ──────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    async function fetchOptionsAndVotes() {
      setLoading(true);

      // Fetch options
      const { data: optionsData, error: optionsError } = await supabase
        .from("poll_options")
        .select("*")
        .eq("poll_id", poll.id)
        .order("order_index", { ascending: true });

      if (optionsError || !optionsData) {
        console.error("Error fetching poll options:", optionsError);
        setLoading(false);
        return;
      }

      // Fetch all votes for this poll
      const { data: votesData, error: votesError } = await supabase
        .from("poll_votes")
        .select("*")
        .eq("poll_id", poll.id);

      if (votesError) {
        console.error("Error fetching poll votes:", votesError);
      }

      const votes: PollVote[] = votesData ?? [];

      // Merge votes into options
      const merged: OptionWithVotes[] = optionsData.map((opt) => ({
        ...opt,
        votes: votes.filter((v) => v.option_id === opt.id).length,
        votedByUser: votes.some(
          (v) => v.option_id === opt.id && v.user_id === userId
        ),
      }));

      setOptions(merged);
      setLoading(false);
    }

    fetchOptionsAndVotes();

    // Real-time vote updates
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
        async () => {
          // Refetch votes on any change
          const { data: votesData } = await supabase
            .from("poll_votes")
            .select("*")
            .eq("poll_id", poll.id);

          const votes: PollVote[] = votesData ?? [];

          setOptions((prev) =>
            prev.map((opt) => ({
              ...opt,
              votes: votes.filter((v) => v.option_id === opt.id).length,
              votedByUser: votes.some(
                (v) => v.option_id === opt.id && v.user_id === userId
              ),
            }))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poll.id, userId]);

  // ── Vote handler ───────────────────────────────────────────────────────────
  const handleVote = async (optionId: string) => {
    if (voting || isClosed) return;

    // Single-choice: can't re-vote same option; can change vote
    const alreadyVotedThis = options.find(
      (o) => o.id === optionId
    )?.votedByUser;
    if (alreadyVotedThis) return;

    setVoting(true);
    const supabase = createClient();

    try {
      if (!poll.allow_multiple && hasVoted) {
        // Remove previous vote first (single choice)
        await supabase
          .from("poll_votes")
          .delete()
          .eq("poll_id", poll.id)
          .eq("user_id", userId);
      }

      // Insert new vote
      const { error } = await supabase.from("poll_votes").insert({
        poll_id: poll.id,
        option_id: optionId,
        user_id: userId,
      });

      if (error) throw error;

      // Optimistic local update
      setOptions((prev) =>
        prev.map((opt) => {
          if (!poll.allow_multiple) {
            // Clear all previous votes for single-choice
            if (opt.id === optionId) {
              return { ...opt, votes: opt.votes + 1, votedByUser: true };
            }
            if (opt.votedByUser) {
              return {
                ...opt,
                votes: Math.max(0, opt.votes - 1),
                votedByUser: false,
              };
            }
            return opt;
          } else {
            // Multi-choice: just add
            if (opt.id === optionId) {
              return { ...opt, votes: opt.votes + 1, votedByUser: true };
            }
            return opt;
          }
        })
      );
    } catch (error) {
      console.error("Error voting:", error);
    } finally {
      setVoting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-64 rounded-xl bg-card border border-border p-4 shadow-sm">
      {/* Title row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-wide">
            Poll
          </span>
        </div>
        {isClosed && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Lock className="w-3 h-3" />
            <span>Closed</span>
          </div>
        )}
      </div>

      <h4 className="text-sm font-semibold text-card-foreground mb-3 leading-relaxed">
        {poll.question}
      </h4>

      {/* Options */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {options.map((option) => {
            const percentage =
              totalVotes > 0
                ? Math.round((option.votes / totalVotes) * 100)
                : 0;
            const isSelected = option.votedByUser;
            const canVote = !isClosed && !voting;

            return (
              <button
                key={option.id}
                onClick={() => handleVote(option.id)}
                disabled={!canVote || isSelected}
                className={cn(
                  "relative w-full text-left px-3 py-2 rounded-lg text-sm transition-all overflow-hidden",
                  isSelected
                    ? "ring-2 ring-primary/50"
                    : canVote
                    ? "hover:bg-secondary"
                    : "cursor-default",
                  (!canVote || isSelected) && "cursor-default"
                )}
              >
                {/* Progress bar */}
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-lg transition-all duration-500",
                    isSelected ? "bg-primary/15" : "bg-muted/50"
                  )}
                  style={{ width: `${percentage}%` }}
                />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-card-foreground",
                        isSelected && "font-medium"
                      )}
                    >
                      {option.option_text}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium ml-2 shrink-0">
                    {percentage}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <p className="text-[11px] text-muted-foreground mt-3">
        {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        {!isClosed && !hasVoted && " · Tap to vote"}
        {!isClosed &&
          hasVoted &&
          poll.allow_multiple &&
          " · Select more options"}
        {isClosed && " · Poll closed"}
      </p>
    </div>
  );
}
