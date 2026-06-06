import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Calendar,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "@heroui/react";
import { I18nProvider } from "@react-aria/i18n";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import {
  type MealPlanEntry,
  type RecipeOut,
  type UserPreferences,
  deleteMealPlanEntry,
  listMealPlan,
  setMealPlanEntry,
} from "../api/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

function proxyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return `/api/proxy/image?url=${encodeURIComponent(url)}`;
}

function parseCellAriaLabel(label: string): string | null {
  // "Saturday, June 7, 2025" → "2025-06-07"
  const withoutDay = label.replace(/^[A-Za-z]+,\s*/, "");
  const d = new Date(withoutDay);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function injectDots(container: HTMLElement | null, planned: Set<string>) {
  if (!container) return;
  container.querySelectorAll(".pk-dot").forEach((el) => el.remove());
  container.querySelectorAll('[data-slot="cell-button"]').forEach((btn) => {
    const label = btn.getAttribute("aria-label") ?? "";
    const dateStr = parseCellAriaLabel(label);
    if (!dateStr || !planned.has(dateStr)) return;
    const dot = document.createElement("span");
    dot.className = "pk-dot";
    Object.assign(dot.style, {
      position: "absolute",
      bottom: "3px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "4px",
      height: "4px",
      borderRadius: "50%",
      background: "hsl(var(--heroui-primary))",
      pointerEvents: "none",
    });
    (btn as HTMLElement).style.position = "relative";
    btn.appendChild(dot);
  });
}

const WEEK_START_LOCALE: Record<number, string> = {
  0: "en-US",  // Sunday
  1: "en-GB",  // Monday
  6: "ar-SA",  // Saturday — shows Arabic, best available locale for Sat start
};

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── RecipeThumb ───────────────────────────────────────────────────────────────

function RecipeThumb({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-default-100 ${className}`}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-default-200" />}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

// ── DayRow ────────────────────────────────────────────────────────────────────

function DayRow({
  day, year, month, entry, isToday, isSelected, setRef, onAdd, onTap,
}: {
  day: number;
  year: number;
  month: number;
  entry?: MealPlanEntry;
  isToday: boolean;
  isSelected: boolean;
  setRef: (el: HTMLDivElement | null) => void;
  onAdd: () => void;
  onTap: () => void;
}) {
  const date = new Date(year, month - 1, day);
  const dayName = SHORT_DAYS[date.getDay()];
  const thumb = proxyUrl(entry?.recipe.thumbnail_url);
  return (
    <div
      ref={setRef}
      className={`flex items-center gap-3 py-3 border-b border-divider border-l-[3px] transition-colors ${
        isSelected ? "border-l-primary bg-primary/10" : "border-l-transparent"
      } ${isToday && !isSelected ? "bg-primary/5" : ""} pl-[13px] pr-4`}
    >
      {/* Date column */}
      <div className={`w-12 shrink-0 text-center ${isToday || isSelected ? "text-primary" : "text-default-500"}`}>
        <p className="text-[10px] font-semibold uppercase tracking-wide">{dayName}</p>
        {isToday ? (
          <p className="text-2xl font-bold leading-none flex items-center justify-center mx-auto w-9 h-9 rounded-full bg-primary text-primary-foreground">
            {day}
          </p>
        ) : (
          <p className={`text-2xl font-bold leading-tight ${isSelected ? "text-primary" : "text-default-800"}`}>
            {day}
          </p>
        )}
      </div>

      {/* Vertical divider */}
      <div className={`w-px self-stretch ${isToday || isSelected ? "bg-primary/30" : "bg-divider"}`} />

      {/* Content */}
      {entry ? (
        <button
          onClick={onTap}
          className="flex-1 flex items-center gap-3 min-w-0 active:opacity-60 transition-opacity"
        >
          {thumb ? (
            <RecipeThumb src={thumb} alt={entry.recipe.title} className="w-12 h-12 rounded-xl shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-default-100 shrink-0 flex items-center justify-center text-xl">
              🍽
            </div>
          )}
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-semibold line-clamp-2 text-default-800 leading-snug">
              {entry.recipe.title}
            </p>
            {entry.recipe.kcal_per_serving != null && (
              <p className="text-xs text-default-400 mt-0.5">{entry.recipe.kcal_per_serving} kcal</p>
            )}
          </div>
          <svg className="w-4 h-4 text-default-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : (
        <button
          onClick={onAdd}
          className="flex-1 flex items-center gap-2 py-3 px-4 rounded-xl border border-dashed border-default-200 text-default-400 text-sm hover:border-default-400 hover:text-default-600 active:opacity-60 transition-all"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Add a dish</span>
        </button>
      )}
    </div>
  );
}

// ── MealPlanPage ──────────────────────────────────────────────────────────────

interface MealPlanPageProps {
  recipes: RecipeOut[];
  preferences: UserPreferences | null;
}

export default function MealPlanPage({ recipes, preferences }: MealPlanPageProps) {
  const todayDate = today(getLocalTimeZone());

  const [selectedDate, setSelectedDate] = useState<CalendarDate>(todayDate);
  const [viewYear, setViewYear] = useState(todayDate.year);
  const [viewMonth, setViewMonth] = useState(todayDate.month);

  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [actionEntry, setActionEntry] = useState<MealPlanEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const calendarRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  function scrollToDay(day: number) {
    const el = dayRefs.current.get(day);
    if (!el) return;
    const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom ?? 0;
    const bottomNavHeight = 72; // 4.5rem bottom nav
    const visibleHeight = window.innerHeight - stickyBottom - bottomNavHeight;
    const elRect = el.getBoundingClientRect();
    const targetScroll =
      window.scrollY + elRect.top - stickyBottom - (visibleHeight - elRect.height) / 2;
    window.scrollTo({ top: Math.max(0, targetScroll), behavior: "smooth" });
  }

  // Fetch entries when month changes
  useEffect(() => {
    setLoading(true);
    const month = `${viewYear}-${String(viewMonth).padStart(2, "0")}`;
    listMealPlan(month)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [viewYear, viewMonth]);

  // Inject meal dots into calendar cells after render
  useEffect(() => {
    const planned = new Set(entries.map((e) => e.date));
    const timer = setTimeout(() => injectDots(calendarRef.current, planned), 60);
    return () => clearTimeout(timer);
  }, [entries, viewYear, viewMonth]);

  // Auto-scroll to today on first load
  useEffect(() => {
    const timer = setTimeout(() => {
      if (todayDate.year === viewYear && todayDate.month === viewMonth) {
        scrollToDay(todayDate.day);
      }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const daysInMonth = useMemo(
    () => new Date(viewYear, viewMonth, 0).getDate(),
    [viewYear, viewMonth]
  );

  const entriesByDate = useMemo(
    () => new Map(entries.map((e) => [e.date, e])),
    [entries]
  );

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? recipes.filter((r) => r.title.toLowerCase().includes(q)) : recipes;
  }, [recipes, searchQuery]);

  const calendarLocale = WEEK_START_LOCALE[preferences?.week_start_day ?? 1] ?? "en-GB";

  function handleCalendarChange(date: CalendarDate) {
    setSelectedDate(date);
    if (date.year !== viewYear || date.month !== viewMonth) {
      setViewYear(date.year);
      setViewMonth(date.month);
    }
    // Delay gives React time to render the new month's rows before we measure
    setTimeout(() => scrollToDay(date.day), 150);
  }

  function handleFocusChange(date: CalendarDate) {
    if (date.year !== viewYear || date.month !== viewMonth) {
      setViewYear(date.year);
      setViewMonth(date.month);
      setSelectedDate(date);
    }
  }

  function openPicker(dateStr: string) {
    setTargetDate(dateStr);
    setSearchQuery("");
    setPickerOpen(true);
    setActionEntry(null);
  }

  async function handleAssign(recipe: RecipeOut) {
    if (!targetDate) return;
    setBusy(true);
    try {
      const entry = await setMealPlanEntry(targetDate, recipe.id);
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.date === targetDate);
        return idx >= 0 ? prev.map((e, i) => (i === idx ? entry : e)) : [...prev, entry];
      });
      setPickerOpen(false);
      setTargetDate(null);
    } catch {
      // silently fail — no network error UI for now
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!actionEntry) return;
    setBusy(true);
    try {
      await deleteMealPlanEntry(actionEntry.date);
      setEntries((prev) => prev.filter((e) => e.date !== actionEntry.date));
      setActionEntry(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Sticky header + calendar ─────────────────────────────────────────── */}
      <div
        ref={stickyRef}
        className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-divider"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center px-4 h-14 max-w-lg mx-auto">
          <h1 className="text-xl font-bold">Meal Plan</h1>
        </div>

        <div ref={calendarRef} className="pk-cal pb-2 px-1">
          <I18nProvider locale={calendarLocale}>
            <Calendar
              aria-label="Meal plan calendar"
              value={selectedDate}
              onChange={handleCalendarChange}
              onFocusChange={handleFocusChange}
              classNames={{
                base: "shadow-none w-full max-w-none bg-transparent rounded-none flex flex-col items-center",
                headerWrapper: "px-3 pt-0 pb-2",
                header: "text-sm font-bold tracking-tight",
                prevButton: "w-8 h-8 min-w-0 text-default-500 hover:text-default-800 transition-colors",
                nextButton: "w-8 h-8 min-w-0 text-default-500 hover:text-default-800 transition-colors",
                gridHeaderCell: "text-[10px] font-semibold uppercase tracking-widest text-default-400 pb-1",
                cell: "p-0",
                cellButton: "w-9 h-9 text-[13px] font-medium mx-auto data-[today=true]:font-bold",
              }}
            />
          </I18nProvider>
        </div>
      </div>

      {/* ── Day list ──────────────────────────────────────────────────────────── */}
      <div className="flex-1">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : (
          Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dateStr = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const entry = entriesByDate.get(dateStr);
            const isToday =
              day === todayDate.day &&
              viewMonth === todayDate.month &&
              viewYear === todayDate.year;
            const isSelected =
              day === selectedDate.day &&
              viewMonth === selectedDate.month &&
              viewYear === selectedDate.year;

            return (
              <DayRow
                key={dateStr}
                day={day}
                year={viewYear}
                month={viewMonth}
                entry={entry}
                isToday={isToday}
                isSelected={isSelected}
                setRef={(el) => {
                  if (el) dayRefs.current.set(day, el);
                  else dayRefs.current.delete(day);
                }}
                onAdd={() => openPicker(dateStr)}
                onTap={() => entry && setActionEntry(entry)}
              />
            );
          })
        )}
      </div>

      {/* ── Recipe picker modal ───────────────────────────────────────────────── */}
      <Modal
        isOpen={pickerOpen}
        onClose={() => { setPickerOpen(false); setTargetDate(null); }}
        scrollBehavior="inside"
        placement="bottom"
        size="full"
        classNames={{ base: "max-h-[85vh] rounded-t-2xl rounded-b-none" }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-3 pb-0">
            <span className="text-lg">Choose a dish</span>
            <Input
              placeholder="Search recipes…"
              value={searchQuery}
              onValueChange={setSearchQuery}
              isClearable
              size="sm"
              variant="bordered"
              autoFocus
              startContent={
                <svg className="w-4 h-4 text-default-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
              }
            />
          </ModalHeader>
          <ModalBody className="pt-2 px-0">
            {recipes.length === 0 ? (
              <p className="text-center text-default-400 py-12 px-4">
                No recipes yet. Add some from the Recipes tab first.
              </p>
            ) : filteredRecipes.length === 0 ? (
              <p className="text-center text-default-400 py-12">No recipes match your search.</p>
            ) : (
              <div>
                {filteredRecipes.map((recipe) => {
                  const thumb = proxyUrl(recipe.thumbnail_url);
                  return (
                    <button
                      key={recipe.id}
                      onClick={() => handleAssign(recipe)}
                      disabled={busy}
                      className="flex items-center gap-3 px-4 py-3 w-full text-left border-b border-divider last:border-0 active:bg-default-100 transition-colors disabled:opacity-50"
                    >
                      {thumb ? (
                        <RecipeThumb src={thumb} alt={recipe.title} className="w-12 h-12 rounded-xl shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-default-100 shrink-0 flex items-center justify-center text-xl">
                          🍽
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold line-clamp-2 leading-snug">{recipe.title}</p>
                        <div className="flex gap-2 mt-0.5">
                          {recipe.kcal_per_serving != null && (
                            <span className="text-xs text-default-400">{recipe.kcal_per_serving} kcal</span>
                          )}
                          {recipe.creator_handle && (
                            <span className="text-xs text-default-400">@{recipe.creator_handle}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* ── Day action sheet ──────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!actionEntry}
        onClose={() => setActionEntry(null)}
        placement="bottom"
        size="sm"
        classNames={{ base: "rounded-t-2xl rounded-b-none mx-0 mb-0" }}
      >
        <ModalContent>
          {actionEntry && (
            <>
              <ModalHeader className="flex items-center gap-3 pb-2">
                {proxyUrl(actionEntry.recipe.thumbnail_url) ? (
                  <RecipeThumb
                    src={proxyUrl(actionEntry.recipe.thumbnail_url)!}
                    alt={actionEntry.recipe.title}
                    className="w-12 h-12 rounded-xl shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-default-100 shrink-0 flex items-center justify-center text-xl">🍽</div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold line-clamp-2 leading-snug">{actionEntry.recipe.title}</p>
                  {actionEntry.recipe.kcal_per_serving != null && (
                    <p className="text-xs text-default-400 mt-0.5">{actionEntry.recipe.kcal_per_serving} kcal</p>
                  )}
                </div>
              </ModalHeader>
              <ModalBody className="gap-2 pt-0 pb-2">
                <Button
                  variant="flat"
                  fullWidth
                  onPress={() => openPicker(actionEntry.date)}
                >
                  Change recipe
                </Button>
                <Button
                  variant="flat"
                  color="danger"
                  fullWidth
                  isLoading={busy}
                  onPress={handleRemove}
                >
                  Remove from plan
                </Button>
              </ModalBody>
              <ModalFooter className="pt-0" />
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
