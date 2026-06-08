import { useState } from "react";
import BellPopover from "./BellPopover";
import HouseholdSwitcher from "./HouseholdSwitcher";
import { useHousehold } from "../context/HouseholdContext";

interface PageHeaderProps {
  title: string;
  action?: React.ReactNode;
  searchSlot?: React.ReactNode;
}

export default function PageHeader({ title, action, searchSlot }: PageHeaderProps) {
  const { activeHousehold } = useHousehold();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const bandColor = activeHousehold?.color ?? null;

  return (
    <header
      className={`sticky top-0 z-30 backdrop-blur-md border-b md:rounded-t-xl ${
        bandColor ? "border-zinc-200" : "bg-background/80 border-zinc-200"
      }`}
      style={
        bandColor
          ? { paddingTop: "env(safe-area-inset-top)", backgroundColor: `${bandColor}18`, borderBottomColor: `${bandColor}40` }
          : { paddingTop: "env(safe-area-inset-top)" }
      }
    >
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto md:max-w-none md:mx-0">
        {/* Mobile: clickable area to open household switcher */}
        <button
          type="button"
          className="flex-1 min-w-0 text-left md:hidden"
          onClick={() => setSwitcherOpen(true)}
        >
          <h1 className="text-xl font-bold leading-tight truncate">{title}</h1>
          <p
            className="text-[11px] font-semibold uppercase tracking-wide leading-tight flex items-center gap-0.5"
            style={{ color: bandColor ?? undefined }}
          >
            <span className="truncate">{activeHousehold ? activeHousehold.name : "Personal Library"}</span>
            <svg className="w-3 h-3 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </p>
        </button>
        {/* Desktop: static title + optional search slot */}
        <h1 className="hidden md:block text-xl font-bold leading-tight truncate shrink-0">{title}</h1>
        {searchSlot && (
          <div className="hidden md:flex flex-1 mx-4 max-w-sm">{searchSlot}</div>
        )}
        <div className={`flex items-center gap-1 shrink-0 ${searchSlot ? "" : "md:ml-auto"} ml-2`}>
          {action}
          <BellPopover />
        </div>
      </div>
      {/* HouseholdSwitcher is in the Sidebar on desktop; keep it here for mobile */}
      <HouseholdSwitcher isOpen={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </header>
  );
}
