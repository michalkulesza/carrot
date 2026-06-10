import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "pl", label: "Polski" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(code: string) {
    i18n.changeLanguage(code);
    setOpen(false);
  }

  return (
    <div ref={ref} className="absolute top-4 right-4 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors"
        aria-label={t("auth.chooseLanguage")}
      >
        <GlobeIcon />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 rounded-xl bg-white border border-zinc-200 shadow-lg overflow-hidden">
          {LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => select(code)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                i18n.language === code
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
