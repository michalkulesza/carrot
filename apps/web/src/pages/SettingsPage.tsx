import { useRef, useState } from "react";
import { Button } from "@heroui/react";
import PageHeader from "../components/PageHeader";
import { exportRecipes, importRecipes } from "../api/client";

export default function SettingsPage() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-default-400">Data</h2>

          <div className="flex flex-col gap-2 rounded-xl border border-divider p-4">
            <p className="text-sm font-medium">Export recipes</p>
            <p className="text-xs text-default-400">Download all your recipes as a CSV file.</p>
            <Button
              size="sm"
              variant="flat"
              onPress={handleExport}
              isLoading={exporting}
              className="self-start"
            >
              Export CSV
            </Button>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-divider p-4">
            <p className="text-sm font-medium">Import recipes</p>
            <p className="text-xs text-default-400">Import recipes from a previously exported CSV file.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              size="sm"
              variant="flat"
              onPress={() => fileRef.current?.click()}
              isLoading={importing}
              className="self-start"
            >
              Choose CSV…
            </Button>
            {importResult && (
              <p className="text-xs text-success font-medium">{importResult}</p>
            )}
          </div>
        </section>

        {error && (
          <div className="bg-danger-50 text-danger rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

      </div>
    </>
  );
}
