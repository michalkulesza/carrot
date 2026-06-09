import { useState } from "react";
import { Button, Popover, PopoverContent, PopoverDialog, toast } from "@heroui/react";
import { acceptInvitation, declineInvitation } from "../api/client";
import { useHousehold } from "../context/HouseholdContext";

export default function BellPopover() {
  const { invitations, refetchInvitations, refetchHouseholds } = useHousehold();
  const [busy, setBusy] = useState<string | null>(null);

  const count = invitations.length;

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
          {invitations.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">No notifications</div>
          ) : (
            <ul className="divide-y divide-zinc-200 max-h-80 overflow-y-auto">
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
                    <Button
                      size="sm"
                      variant="primary"
                      isDisabled={busy === inv.id}
                      onPress={() => handleAccept(inv.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={busy === inv.id}
                      onPress={() => handleDecline(inv.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PopoverDialog>
      </PopoverContent>
    </Popover>
  );
}
