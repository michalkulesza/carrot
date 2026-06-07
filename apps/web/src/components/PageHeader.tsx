import { useState } from "react";
import BellPopover from "./BellPopover";
import HouseholdSwitcher from "./HouseholdSwitcher";
import { useHousehold } from "../context/HouseholdContext";

interface PageHeaderProps {
  title: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, action }: PageHeaderProps) {
  const { activeHousehold } = useHousehold();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const bandColor = activeHousehold?.color ?? null;

  return (
    <header
      className={`sticky top-0 z-30 backdrop-blur-md border-b ${
        bandColor ? "border-divider" : "bg-background/80 border-divider"
      }`}
      style={
        bandColor
          ? { paddingTop: "env(safe-area-inset-top)", backgroundColor: `${bandColor}18`, borderBottomColor: `${bandColor}40` }
          : { paddingTop: "env(safe-area-inset-top)" }
      }
    >
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <button
          type="button"
          className="flex-1 min-w-0 text-left"
          onClick={() => setSwitcherOpen(true)}
        >
          <h1 className="text-xl font-bold leading-tight truncate">{title}</h1>
          <p
            className="text-[11px] font-semibold uppercase tracking-wide truncate leading-tight"
            style={{ color: bandColor ?? undefined }}
          >
            {activeHousehold ? activeHousehold.name : "Personal Library"}
          </p>
        </button>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {action}
          <BellPopover />
        </div>
      </div>
      <HouseholdSwitcher isOpen={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </header>
  );
}
