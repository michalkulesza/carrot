import { NavLink } from "react-router-dom";

interface BottomNavProps {
  onAddRecipe: () => void;
}

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const active = "text-primary flex flex-col items-center gap-0.5 flex-1 pt-3 pb-2 text-xs font-medium";
const idle   = "text-zinc-400 flex flex-col items-center gap-0.5 flex-1 pt-3 pb-2 text-xs";

export default function BottomNav({ onAddRecipe }: BottomNavProps) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-100"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-end max-w-lg mx-auto">

        <NavLink to="/" end className={({ isActive }) => isActive ? active : idle}>
          <BookIcon />
          <span>Recipes</span>
        </NavLink>

        <NavLink to="/plan" className={({ isActive }) => isActive ? active : idle}>
          <CalendarIcon />
          <span>Meal Plan</span>
        </NavLink>

        {/* Centre FAB */}
        <div className="flex flex-col items-center flex-1 -mt-6 pb-2">
          <button
            onClick={onAddRecipe}
            className="w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform"
            aria-label="Add recipe"
          >
            <span className="-translate-y-[2px] inline-block">+</span>
          </button>
          <span className="text-xs text-zinc-400 mt-1">Add</span>
        </div>

        <NavLink to="/shopping" className={({ isActive }) => isActive ? active : idle}>
          <CartIcon />
          <span>Shopping</span>
        </NavLink>

        <NavLink to="/settings" className={({ isActive }) => isActive ? active : idle}>
          <GearIcon />
          <span>Settings</span>
        </NavLink>

      </div>
    </nav>
  );
}
