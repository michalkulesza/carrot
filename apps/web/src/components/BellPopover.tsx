import { useState } from "react";
import { Button, Popover, PopoverContent, PopoverDialog, toast } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { acceptInvitation, declineInvitation } from "../api/client";
import { useHousehold } from "../context/HouseholdContext";
import { useTimers, getRemainingSeconds, formatCountdown, formatDurationLabel } from "../context/TimerContext";

export default function BellPopover() {
  const { invitations, refetchInvitations, refetchHouseholds } = useHousehold();
  const { timers, pauseTimer, resumeTimer, cancelTimer, timerHistory, dismissHistoryItem, clearHistory } = useTimers();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const timerList = [...timers.values()];
  const count = invitations.length + timerList.length + timerHistory.length;

  async function handleAccept(id: string) {
    setBusy(id);
    try {
      await acceptInvitation(id);
      refetchInvitations();
      refetchHouseholds();
      toast.success("Joined household", { timeout: 3000 });
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : "Error", { timeout: 3000 });
    } finally {
      setBusy(null);
    }
  }

  async function handleDecline(id: string) {
    setBusy(id);
    try {
      await declineInvitation(id);
      refetchInvitations();
    } catch {
      // ignore
    } finally {
      setBusy(null);
    }
  }

  return (
    <Popover>
      <Button variant="ghost" isIconOnly aria-label="Notifications" className="relative rounded-full">
        <svg className="w-5 h-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-danger text-danger-foreground text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>
      <PopoverContent className="p-0 w-80" placement="bottom end">
        <PopoverDialog>
          {count === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">No notifications</div>
          ) : (
            <ul className="divide-y divide-zinc-100 max-h-96 overflow-y-auto">
              {timerList.map((t) => {
                const remaining = getRemainingSeconds(t);
                const isRunning = t.status === "running";
                return (
                  <li key={t.id} className="px-4 py-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${isRunning ? "text-amber-500" : "text-zinc-400"}`}>
                          {isRunning ? "Timer running" : "Timer paused"}
                        </p>
                        <p className="text-sm font-medium truncate">{t.recipeTitle}</p>
                        <p className="text-xs text-zinc-400 truncate">
                          Step {t.stepIndex + 1}: {t.stepText.length > 45 ? t.stepText.slice(0, 42) + "…" : t.stepText}
                        </p>
                      </div>
                      <span className={`font-mono text-sm font-bold tabular-nums shrink-0 pt-4 ${isRunning ? "text-amber-600" : "text-zinc-400"}`}>
                        {t.status === "done" ? "Done ✓" : formatCountdown(remaining)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {isRunning ? (
                        <Button size="sm" variant="secondary" onPress={() => pauseTimer(t.id)}>Pause</Button>
                      ) : (
                        <Button size="sm" variant="secondary" onPress={() => resumeTimer(t.id)}>Resume</Button>
                      )}
                      <Button size="sm" variant="danger-soft" onPress={() => cancelTimer(t.id)}>Cancel</Button>
                    </div>
                  </li>
                );
              })}
              {invitations.map((inv) => (
                <li key={inv.id} className="px-4 py-3 flex flex-col gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-0.5">Household invitation</p>
                    <p className="text-sm font-medium">{inv.household_name}</p>
                    <p className="text-xs text-zinc-400">
                      From {inv.invited_by_nickname || inv.invited_by_email}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" isDisabled={busy === inv.id} onPress={() => handleAccept(inv.id)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="secondary" isDisabled={busy === inv.id} onPress={() => handleDecline(inv.id)}>
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
              {timerHistory.length > 0 && (
                <>
                  <li className="px-4 py-2 flex items-center justify-between bg-zinc-50">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Timer history</span>
                    <button
                      type="button"
                      onClick={clearHistory}
                      className="text-[10px] font-medium text-zinc-400 hover:text-zinc-600 transition-colors"
                    >
                      Clear all
                    </button>
                  </li>
                  {timerHistory.map((t) => (
                    <li key={`hist-${t.id}`} className="px-4 py-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500 mb-0.5">Timer done</p>
                          <p className="text-sm font-medium truncate">{t.recipeTitle}</p>
                          <p className="text-xs text-zinc-400 truncate">
                            Step {t.stepIndex + 1} · {formatDurationLabel(t.totalSeconds)}
                          </p>
                          <p className="text-xs text-zinc-400 truncate">
                            {t.stepText.length > 45 ? t.stepText.slice(0, 42) + "…" : t.stepText}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissHistoryItem(t.id)}
                          className="shrink-0 text-zinc-300 hover:text-zinc-500 transition-colors mt-0.5 text-base leading-none"
                          aria-label="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onPress={() => navigate(`/?recipe=${t.recipeId}&step=${t.componentIndex}-${t.stepIndex}`)}
                      >
                        Go to step ↗
                      </Button>
                    </li>
                  ))}
                </>
              )}
            </ul>
          )}
        </PopoverDialog>
      </PopoverContent>
    </Popover>
  );
}
