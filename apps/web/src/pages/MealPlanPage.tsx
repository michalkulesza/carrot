import { useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "@heroui/react";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import {
  type MealPlanEntry,
  type RecipeOut,
  type Tag,
  type UserPreferences,
  deleteMealPlanEntry,
  listMealPlan,
  setMealPlanEntry,
} from "../api/client";
import RecipeDetailModal from "../components/RecipeDetailModal";
import PageHeader from "../components/PageHeader";

// ── Helpers ───────────────────────────────────────────────────────────────────

function proxyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return `/api/proxy/image?url=${encodeURIComponent(url)}`;
}


const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Export ────────────────────────────────────────────────────────────────────

async function exportMealPlan(entries: MealPlanEntry[], year: number, month: number) {
  const DAY_HEADERS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const byDate = new Map(entries.map((e) => [e.date, e.recipe.title]));

  // Collect Mondays for each week overlapping this month
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const weeks: Date[] = [];
  const startMonday = new Date(firstDay);
  const dow = startMonday.getDay();
  startMonday.setDate(startMonday.getDate() + (dow === 0 ? -6 : 1 - dow));
  for (let d = new Date(startMonday); d <= lastDay; d.setDate(d.getDate() + 7)) {
    weeks.push(new Date(d));
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Week Meal Planner");

  // 169px → 24.3 chars (observed: 22.3 renders as 155px, scaled by 169/155)
  ws.columns = Array(7).fill(null).map(() => ({ width: 24.24 }));

  const centerWrap: Partial<ExcelJS.Alignment> = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  const borderEdge: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF356854" } };
  const ROW_COUNT = 6;
  const totalRows = 1 + ROW_COUNT;

  function outerBorder(rowIdx: number, colIdx: number): Partial<ExcelJS.Borders> {
    return {
      top:    rowIdx === 1          ? borderEdge : undefined,
      bottom: rowIdx === totalRows  ? borderEdge : undefined,
      left:   colIdx === 1          ? borderEdge : undefined,
      right:  colIdx === 7          ? borderEdge : undefined,
    };
  }

  // Header row
  const headerRow = ws.addRow(DAY_HEADERS);
  headerRow.height = 31.22;
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.alignment = centerWrap;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF356854" } };
    cell.font = { name: "Times New Roman", size: 16, color: { argb: "FFFFFFFF" } };
    cell.border = outerBorder(1, col);
  });

  // Data rows — always 6
  for (let wi = 0; wi < ROW_COUNT; wi++) {
    const monday = weeks[wi];
    const rowData: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      if (monday) {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        rowData.push(byDate.get(ds) ?? null);
      } else {
        rowData.push(null);
      }
    }
    const row = ws.addRow(rowData);
    row.height = 71.38;
    const bgColor = wi % 2 === 0 ? "FFFFFFFF" : "FFF6F8F9";
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.alignment = centerWrap;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.font = { name: "Roboto", size: 14, color: { argb: "FF434343" } };
      cell.border = outerBorder(wi + 2, col);
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" });
  a.href = url;
  a.download = `meal-plan-${year}-${String(month).padStart(2, "0")}-${monthName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Print ─────────────────────────────────────────────────────────────────────

function buildWeekRows(entries: MealPlanEntry[], year: number, month: number): (string | null)[][] {
  const byDate = new Map(entries.map((e) => [e.date, e.recipe.title]));
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const weeks: Date[] = [];
  const startMonday = new Date(firstDay);
  const dow = startMonday.getDay();
  startMonday.setDate(startMonday.getDate() + (dow === 0 ? -6 : 1 - dow));
  for (let d = new Date(startMonday); d <= lastDay; d.setDate(d.getDate() + 7)) {
    weeks.push(new Date(d));
  }
  const rows: (string | null)[][] = [];
  for (let wi = 0; wi < 6; wi++) {
    const monday = weeks[wi];
    const row: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      if (monday) {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        row.push(byDate.get(ds) ?? null);
      } else {
        row.push(null);
      }
    }
    rows.push(row);
  }
  return rows;
}

function printMealPlan(entries: MealPlanEntry[], year: number, month: number) {
  const DAY_HEADERS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const rows = buildWeekRows(entries, year, month);
  const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" });

  const headerCells = DAY_HEADERS.map(
    (d) => `<th>${d}</th>`
  ).join("");

  const dataRows = rows.map((row, wi) => {
    const cells = row.map((cell) => `<td>${cell ?? ""}</td>`).join("");
    return `<tr class="${wi % 2 === 0 ? "odd" : "even"}">${cells}</tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Meal Plan – ${monthName} ${year}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Roboto', sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #356854;
    table-layout: fixed;
  }
  th {
    background: #356854;
    color: #fff;
    font-family: 'Times New Roman', serif;
    font-size: 12pt;
    text-align: center;
    vertical-align: middle;
    padding: 6px 4px;
    word-wrap: break-word;
  }
  td {
    font-family: 'Roboto', sans-serif;
    font-size: 9pt;
    color: #434343;
    text-align: center;
    vertical-align: middle;
    padding: 4px;
    height: 17mm;
    word-wrap: break-word;
  }
  tr.odd td  { background: #ffffff; }
  tr.even td { background: #f6f8f9; }
</style>
</head>
<body>
<table>
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${dataRows}</tbody>
</table>
<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

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
      } pl-[13px] pr-4`}
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

// ── DesktopCalendar ───────────────────────────────────────────────────────────

function DesktopCalendar({
  viewYear, viewMonth, entriesByDate, loading, todayDate, weekStart,
  onPrev, onNext, onToday, onCellClick,
}: {
  viewYear: number;
  viewMonth: number;
  entriesByDate: Map<string, MealPlanEntry>;
  loading: boolean;
  todayDate: CalendarDate;
  weekStart: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onCellClick: (dateStr: string, entry?: MealPlanEntry) => void;
}) {
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay();
  const startPad = (firstDow - weekStart + 7) % 7;
  const dayHeaders = Array.from({ length: 7 }, (_, i) => SHORT_DAYS[(weekStart + i) % 7]);

  type Cell = { dateStr: string; day: number; isCurrentMonth: boolean; isToday: boolean };
  const cells: Cell[] = [];

  // Prev month padding
  const prevMonthDays = new Date(viewYear, viewMonth - 1, 0).getDate();
  for (let i = startPad - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const m = viewMonth === 1 ? 12 : viewMonth - 1;
    const y = viewMonth === 1 ? viewYear - 1 : viewYear;
    cells.push({ dateStr: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`, day, isCurrentMonth: false, isToday: false });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = day === todayDate.day && viewMonth === todayDate.month && viewYear === todayDate.year;
    cells.push({ dateStr, day, isCurrentMonth: true, isToday });
  }

  // Next month padding to complete last row
  let nd = 1;
  while (cells.length % 7 !== 0) {
    const m = viewMonth === 12 ? 1 : viewMonth + 1;
    const y = viewMonth === 12 ? viewYear + 1 : viewYear;
    cells.push({ dateStr: `${y}-${String(m).padStart(2, "0")}-${String(nd).padStart(2, "0")}`, day: nd++, isCurrentMonth: false, isToday: false });
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{MONTH_NAMES[viewMonth - 1]} {viewYear}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onToday}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-default-200 hover:bg-default-100 transition-colors"
          >
            Today
          </button>
          <div className="flex">
            <button
              onClick={onPrev}
              className="p-1.5 rounded-l-lg border border-default-200 hover:bg-default-100 transition-colors"
              aria-label="Previous month"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button
              onClick={onNext}
              className="p-1.5 rounded-r-lg border border-l-0 border-default-200 hover:bg-default-100 transition-colors"
              aria-label="Next month"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 border-l border-t border-divider rounded-xl overflow-hidden">
        {/* Day headers */}
        {dayHeaders.map((h) => (
          <div key={h} className="border-r border-b border-divider bg-default-50 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-default-400">
            {h}
          </div>
        ))}

        {/* Day cells */}
        {loading ? (
          <div className="col-span-7 flex items-center justify-center h-48">
            <Spinner />
          </div>
        ) : cells.map(({ dateStr, day, isCurrentMonth, isToday }) => {
          const entry = entriesByDate.get(dateStr);
          const thumb = proxyUrl(entry?.recipe.thumbnail_url);
          return (
            <button
              key={dateStr}
              onClick={() => onCellClick(dateStr, entry)}
              className={`border-r border-b border-divider p-2 text-left min-h-[110px] transition-colors group ${
                isCurrentMonth ? "bg-background hover:bg-primary/5" : "bg-default-50/50"
              }`}
            >
              <span className={`text-sm font-medium inline-flex items-center justify-center w-7 h-7 rounded-full ${
                isToday
                  ? "bg-primary text-primary-foreground font-bold"
                  : isCurrentMonth
                  ? "text-default-700"
                  : "text-default-300"
              }`}>
                {day}
              </span>
              {entry ? (
                <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-primary/10 px-1.5 py-1 overflow-hidden">
                  {thumb && (
                    <RecipeThumb src={thumb} alt={entry.recipe.title} className="w-5 h-5 rounded shrink-0" />
                  )}
                  <span className="text-xs font-medium text-primary truncate">{entry.recipe.title}</span>
                </div>
              ) : isCurrentMonth ? (
                <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-default-300 text-xs">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── MealPlanPage ──────────────────────────────────────────────────────────────

interface MealPlanPageProps {
  recipes: RecipeOut[];
  preferences: UserPreferences | null;
  allTags: Tag[];
  onTagCreated: (tag: Tag) => void;
  onRecipeUpdated?: (r: RecipeOut) => void;
  onRecipeDeleted?: (id: string) => void;
}

export default function MealPlanPage({ recipes, preferences, allTags, onTagCreated, onRecipeUpdated, onRecipeDeleted }: MealPlanPageProps) {
  const todayDate = today(getLocalTimeZone());

  const [viewYear, setViewYear] = useState(todayDate.year);
  const [viewMonth, setViewMonth] = useState(todayDate.month);

  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [actionEntry, setActionEntry] = useState<MealPlanEntry | null>(null);
  const [viewRecipe, setViewRecipe] = useState<RecipeOut | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map());
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

  function goToPrevMonth() {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  }
  function goToNextMonth() {
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
  }
  function goToToday() {
    setViewYear(todayDate.year);
    setViewMonth(todayDate.month);
  }
  function handleCellClick(dateStr: string, entry?: MealPlanEntry) {
    if (entry) setActionEntry(entry);
    else openPicker(dateStr);
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

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title="Meal Plan"
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="flat"
              isDisabled={loading || entries.length === 0}
              onPress={() => printMealPlan(entries, viewYear, viewMonth)}
            >
              Print
            </Button>
            <Button
              size="sm"
              variant="flat"
              isDisabled={loading || entries.length === 0}
              onPress={() => void exportMealPlan(entries, viewYear, viewMonth)}
            >
              Export as xlsx
            </Button>
          </div>
        }
      />

      {/* ── Desktop: full monthly grid ───────────────────────────────────────── */}
      <div className="hidden md:block">
        <DesktopCalendar
          viewYear={viewYear}
          viewMonth={viewMonth}
          entriesByDate={entriesByDate}
          loading={loading}
          todayDate={todayDate}
          weekStart={preferences?.week_start_day ?? 1}
          onPrev={goToPrevMonth}
          onNext={goToNextMonth}
          onToday={goToToday}
          onCellClick={handleCellClick}
        />
      </div>

      {/* ── Mobile: month nav + day list ─────────────────────────────────────── */}
      <div className="md:hidden">
        <div
          ref={stickyRef}
          className="sticky top-14 z-20 bg-background/95 backdrop-blur-md border-b border-divider"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-base font-semibold">{MONTH_NAMES[viewMonth - 1]} {viewYear}</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={goToToday}
                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-default-200 active:bg-default-100 transition-colors mr-1"
              >
                Today
              </button>
              <button onClick={goToPrevMonth} className="p-1.5 rounded-lg active:bg-default-100 transition-colors" aria-label="Previous month">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <button onClick={goToNextMonth} className="p-1.5 rounded-lg active:bg-default-100 transition-colors" aria-label="Next month">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>
          </div>
        </div>

        <div>
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

              return (
                <DayRow
                  key={dateStr}
                  day={day}
                  year={viewYear}
                  month={viewMonth}
                  entry={entry}
                  isToday={isToday}
                  isSelected={isToday}
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
        isOpen={!!actionEntry && !viewRecipe}
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
                  onPress={() => setViewRecipe(actionEntry.recipe)}
                >
                  View recipe
                </Button>
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

      {/* ── Recipe detail modal ───────────────────────────────────────────────── */}
      <RecipeDetailModal
        recipe={viewRecipe}
        allTags={allTags}
        onTagCreated={onTagCreated}
        onClose={() => setViewRecipe(null)}
        onUpdated={onRecipeUpdated}
        onDeleted={onRecipeDeleted}
      />
    </div>
  );
}
