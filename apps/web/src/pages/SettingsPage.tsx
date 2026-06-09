import { useRef, useState } from "react";
import { Button, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, Switch, toast } from "@heroui/react";
import PageHeader from "../components/PageHeader";
import {
  exportRecipes, importRecipes, updatePreferences, updateHouseholdAllergens, streamReanalyze,
  createHousehold, leaveHousehold, listMembers, updateHousehold, inviteUser,
  type AllergenData, type RecipeStats, type UserPreferences, type MemberOut, type HouseholdOut,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";

function StatCard({ value, label }: { value: string | number | null; label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1 rounded-xl bg-zinc-50 py-4 px-2">
      <span className="text-2xl font-bold text-zinc-800">
        {value ?? "—"}
      </span>
      <span className="text-xs text-zinc-400 text-center">{label}</span>
    </div>
  );
}

const WEEK_DAY_OPTIONS = [
  { key: "1", label: "Monday" },
  { key: "0", label: "Sunday" },
  { key: "6", label: "Saturday" },
];

const PRESET_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#22c55e", "#ef4444", "#8b5cf6", "#06b6d4",
];

const BIG_14 = [
  { key: "celery", label: "Celery" },
  { key: "gluten", label: "Gluten (wheat, rye, barley)" },
  { key: "crustaceans", label: "Crustaceans" },
  { key: "eggs", label: "Eggs" },
  { key: "fish", label: "Fish" },
  { key: "lupin", label: "Lupin" },
  { key: "milk", label: "Milk / Dairy" },
  { key: "molluscs", label: "Molluscs" },
  { key: "mustard", label: "Mustard" },
  { key: "peanuts", label: "Peanuts" },
  { key: "sesame", label: "Sesame" },
  { key: "soybeans", label: "Soybeans" },
  { key: "sulphites", label: "Sulphur dioxide / Sulphites" },
  { key: "tree nuts", label: "Tree nuts" },
];

interface SettingsPageProps {
  stats: RecipeStats | null;
  onStatsRefresh: () => void;
  preferences: UserPreferences | null;
  onPreferencesChange: (prefs: UserPreferences) => void;
}

// ── Allergen section ──────────────────────────────────────────────────────────

function AllergenSection({
  allergens,
  scopeLabel,
  onSave,
}: {
  allergens: AllergenData;
  scopeLabel: string;
  onSave: (data: AllergenData) => Promise<void>;
}) {
  const [predefined, setPredefined] = useState<string[]>(allergens.predefined ?? []);
  const [custom, setCustom] = useState<string[]>(allergens.custom ?? []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{ done: number; total: number } | null>(null);

  function togglePredefined(key: string) {
    setPredefined((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function addCustomTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !custom.includes(tag)) {
      setCustom((prev) => [...prev, tag]);
    }
    setTagInput("");
  }

  function removeCustomTag(tag: string) {
    setCustom((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ predefined, custom });
      toast.success("Allergens saved", { timeout: 2000 });
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : "Failed to save", { timeout: 3000 });
    } finally {
      setSaving(false);
    }
  }

  function handleReanalyze() {
    setReanalyzing(true);
    setReanalyzeProgress({ done: 0, total: 0 });
    streamReanalyze({
      onStart: (total) => setReanalyzeProgress({ done: 0, total }),
      onProgress: (done, total) => setReanalyzeProgress({ done, total }),
      onComplete: (analyzed) => {
        setReanalyzing(false);
        setReanalyzeProgress(null);
        toast.success(`Re-analyzed ${analyzed} recipe${analyzed !== 1 ? "s" : ""}`, { timeout: 3000 });
      },
      onError: (msg) => {
        setReanalyzing(false);
        setReanalyzeProgress(null);
        toast.danger(msg, { timeout: 3000 });
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-400">{scopeLabel}</p>

      <div className="grid grid-cols-1 gap-2">
        {BIG_14.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={predefined.includes(key)}
              onChange={() => togglePredefined(key)}
              className="w-4 h-4 rounded border-zinc-300 accent-primary"
            />
            <span className="text-sm">{label}</span>
          </label>
        ))}
      </div>

      {/* Custom tags */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-zinc-500">Custom allergens</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. nightshades"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }}
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button size="sm" variant="secondary" onPress={addCustomTag}>Add</Button>
        </div>
        {custom.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {custom.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-600">
                {tag}
                <button type="button" onClick={() => removeCustomTag(tag)} className="text-zinc-400 hover:text-zinc-700 ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="primary" onPress={handleSave} isDisabled={saving}>
          {saving ? "Saving…" : "Save allergens"}
        </Button>
        <Button size="sm" variant="secondary" onPress={handleReanalyze} isDisabled={reanalyzing}>
          {reanalyzing
            ? reanalyzeProgress && reanalyzeProgress.total > 0
              ? `Analyzing… ${reanalyzeProgress.done}/${reanalyzeProgress.total}`
              : "Starting…"
            : "Re-analyze all recipes"}
        </Button>
      </div>
    </div>
  );
}

// ── Create Household modal ────────────────────────────────────────────────────

function CreateHouseholdModal({ isOpen, onClose, onCreated }: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      await createHousehold(name.trim() || undefined, color);
      toast.success("Household created", { timeout: 3000 });
      setName("");
      setColor(PRESET_COLORS[0]);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create household");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader>New household</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="household-name">Name (optional)</label>
                <input
                  id="household-name"
                  type="text"
                  placeholder="My household"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Color</p>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: color === c ? "white" : "transparent",
                        boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
                      }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
            </ModalBody>
            <ModalFooter>
              <Button variant="tertiary" onPress={onClose}>Cancel</Button>
              <Button variant="primary" onPress={handleCreate} isDisabled={busy}>Create</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

// ── Manage Household modal ────────────────────────────────────────────────────

function ManageHouseholdModal({ household, isOpen, onClose, onChanged }: {
  household: HouseholdOut;
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<MemberOut[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [name, setName] = useState(household.name);
  const [color, setColor] = useState(household.color);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMembers() {
    setMembersLoading(true);
    try {
      const m = await listMembers(household.id);
      setMembers(m);
    } catch { /* ignore */ }
    finally { setMembersLoading(false); }
  }

  function handleOpen() {
    setName(household.name);
    setColor(household.color);
    setInviteEmail("");
    setError(null);
    setConfirmLeave(false);
    loadMembers();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateHousehold(household.id, { name: name.trim() || household.name, color });
      toast.success("Saved", { timeout: 2000 });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await inviteUser(household.id, inviteEmail.trim());
      toast.success("Invitation sent", { timeout: 3000 });
      setInviteEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setLeaving(true);
    try {
      await leaveHousehold(household.id);
      toast("Left household", { timeout: 3000 });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to leave");
      setLeaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); if (open) handleOpen(); }}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader>Manage household</ModalHeader>
            <ModalBody className="flex flex-col gap-5">
              {/* Rename */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Name</p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Recolor */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Color</p>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: color === c ? "white" : "transparent",
                        boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
                      }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>

              <Button size="sm" variant="secondary" onPress={handleSave} isDisabled={saving}>
                Save changes
              </Button>

              {/* Members */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Members</p>
                {membersLoading ? (
                  <p className="text-sm text-zinc-400">Loading…</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {members.map((m) => (
                      <li key={m.user_id.toString()} className="text-sm flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-semibold uppercase">
                          {(m.nickname || m.email)[0]}
                        </span>
                        <span className="truncate">{m.nickname || m.email}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Invite */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Invite by email</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button size="sm" variant="secondary" isDisabled={inviting} onPress={handleInvite}>
                    Invite
                  </Button>
                </div>
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              {/* Leave */}
              <div className="border-t border-zinc-200 pt-3">
                {!confirmLeave ? (
                  <Button size="sm" variant="danger-soft" onPress={() => setConfirmLeave(true)}>
                    Leave household
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-danger font-medium">Are you sure?</span>
                    <Button size="sm" variant="danger" isDisabled={leaving} onPress={handleLeave}>
                      Leave
                    </Button>
                    <Button size="sm" variant="tertiary" onPress={() => setConfirmLeave(false)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="tertiary" onPress={onClose}>Close</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage({ stats, onStatsRefresh, preferences, onPreferencesChange }: SettingsPageProps) {
  const { user, logout } = useAuth();
  const { households, activeHouseholdId, activeHousehold, refetchHouseholds } = useHousehold();
  const [loggingOut, setLoggingOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [managingHousehold, setManagingHousehold] = useState<HouseholdOut | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const displayName = user?.nickname || user?.email || "";

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await exportRecipes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const { imported } = await importRecipes(file);
      setImportResult(`Imported ${imported} recipe${imported !== 1 ? "s" : ""}`);
      onStatsRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSaveAllergens(data: { predefined: string[]; custom: string[] }) {
    if (activeHousehold) {
      await updateHouseholdAllergens(activeHousehold.id, data);
      refetchHouseholds();
    } else {
      const updated = await updatePreferences({ personal_allergens: data });
      onPreferencesChange(updated);
    }
  }

  const allergenScopeLabel = activeHousehold
    ? `Applied to ${activeHousehold.name}`
    : "Applied to your personal recipes";

  const currentAllergens: { predefined: string[]; custom: string[] } = activeHousehold?.allergens
    ?? preferences?.personal_allergens
    ?? { predefined: [], custom: [] };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="px-4 py-6 flex flex-col gap-6">

        {/* Profile */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-zinc-200 flex items-center justify-center text-lg font-bold uppercase shrink-0">
            {displayName[0] ?? "?"}
          </div>
          <div className="min-w-0">
            {user?.nickname && (
              <p className="font-semibold text-base truncate">{user.nickname}</p>
            )}
            <p className="text-sm text-zinc-400 truncate">{user?.email}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-2">
          <StatCard value={stats?.total_recipes ?? null} label="Recipes" />
          <StatCard value={stats?.total_ingredients ?? null} label="Ingredients" />
          <StatCard value={stats?.avg_kcal ?? null} label="Avg kcal" />
        </div>

        {/* Households */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Households</h2>
            <Button size="sm" variant="secondary" onPress={() => setCreateOpen(true)}>+ New</Button>
          </div>

          {households.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-400">
              No households yet. Create one to share recipes with others.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {households.map((h) => (
                <li
                  key={h.id}
                  className="rounded-xl border border-zinc-200 p-3 flex items-center gap-3"
                >
                  <span
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: h.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.name}</p>
                    {h.id === activeHouseholdId && (
                      <p className="text-xs text-primary">Active</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => setManagingHousehold(h)}
                  >
                    Manage
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Allergies & Intolerances */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Allergies & Intolerances</h2>
          <div className="rounded-xl border border-zinc-200 p-4">
            <AllergenSection
              key={activeHouseholdId ?? "personal"}
              allergens={currentAllergens}
              scopeLabel={allergenScopeLabel}
              onSave={handleSaveAllergens}
            />
          </div>
        </section>

        {/* Account */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Account</h2>
          <div className="rounded-xl border border-zinc-200 p-4">
            <Button
              size="sm"
              variant="danger-soft"
              onPress={handleLogout}
              isDisabled={loggingOut}
            >
              {loggingOut ? "Logging out…" : "Log out"}
            </Button>
          </div>
        </section>

        {/* Preferences */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Preferences</h2>
          <div className="rounded-xl border border-zinc-200 p-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="week-start">Week starts on</label>
              <select
                id="week-start"
                value={String(preferences?.week_start_day ?? 1)}
                onChange={(e) => {
                  const day = Number(e.target.value);
                  updatePreferences({ week_start_day: day })
                    .then(onPreferencesChange)
                    .catch(() => {});
                }}
                className="px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {WEEK_DAY_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Auto-apply substitutes</p>
                <p className="text-xs text-zinc-400">Automatically replace flagged ingredients when importing</p>
              </div>
              <Switch
                size="sm"
                isSelected={preferences?.auto_substitute ?? false}
                onChange={(v) => {
                  updatePreferences({ auto_substitute: v })
                    .then(onPreferencesChange)
                    .catch(() => {});
                }}
              >
                <Switch.Control><Switch.Thumb /></Switch.Control>
              </Switch>
            </div>
          </div>
        </section>

        {/* Data */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Data</h2>

          <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-medium">Export recipes</p>
            <p className="text-xs text-zinc-400">Download all your recipes as a CSV file.</p>
            <Button size="sm" variant="secondary" onPress={handleExport} isDisabled={exporting} className="self-start">
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-medium">Import recipes</p>
            <p className="text-xs text-zinc-400">Import recipes from a previously exported CSV file.</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            <Button size="sm" variant="secondary" onPress={() => fileRef.current?.click()} isDisabled={importing} className="self-start">
              {importing ? "Importing…" : "Choose CSV…"}
            </Button>
            {importResult && <p className="text-xs text-success font-medium">{importResult}</p>}
          </div>
        </section>

        {error && (
          <div className="bg-danger-50 text-danger rounded-lg p-3 text-sm">{error}</div>
        )}

      </div>

      <CreateHouseholdModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refetchHouseholds}
      />

      {managingHousehold && (
        <ManageHouseholdModal
          household={managingHousehold}
          isOpen={!!managingHousehold}
          onClose={() => setManagingHousehold(null)}
          onChanged={refetchHouseholds}
        />
      )}
    </>
  );
}
