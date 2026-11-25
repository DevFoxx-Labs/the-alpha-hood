"use client";

import { Download04Icon, FileImportIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { adminApi, notify, useAdmin } from "./admin-shell";
import { AButton, AIcon, Card, Confirm, DataTable, ErrorState, KpiCard, PageHeader, StatusBadge } from "./ui";

/**
 * ADM-01 CSV import: choose a file → the server plans it (dry run, nothing written) → review creates / updates /
 * errors → apply. The server validates every row with the editor's rules; this screen only shows the report.
 */
interface Group {
  rows: string;
  title: string;
  styleId: string | null;
  action: "create" | "update" | "unchanged" | "error";
  colours: number;
  sizes: number;
  error?: string;
}
interface Report {
  ok: boolean;
  applied: boolean;
  totals: { rows: number; create: number; update: number; unchanged: number; errors: number };
  errors: string[];
  groups: Group[];
}

const MAX_BYTES = 2_500_000;
const TONE = { create: "success", update: "active", unchanged: "neutral", error: "danger" } as const;

export function CatalogImportScreen() {
  const { can } = useAdmin();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  if (!can("catalog.write")) return <ErrorState message="Importing products needs the catalogue editor role." />;

  async function choose(f: File | undefined) {
    setReport(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return notify("error", "The file is larger than 2.5 MB — split it.");
    if (!/\.csv$/i.test(f.name)) return notify("error", "Choose a .csv file.");
    const text = await f.text();
    setFile({ name: f.name, text });
    await run(text, false);
  }

  async function run(text: string, apply: boolean) {
    setBusy(true);
    try {
      const { report: r } = await adminApi<{ report: Report }>("/api/admin/catalog/import", { method: "POST", body: { csv: text, apply } });
      setReport(r);
      if (apply) notify(r.ok ? "success" : "error", r.ok ? `Imported: ${r.totals.create} new, ${r.totals.update} updated` : `${r.totals.errors} product(s) failed — see the list`);
    } catch (e) {
      setReport(null);
      notify("error", e instanceof Error ? e.message : "Couldn't read the file.");
    } finally {
      setBusy(false);
    }
  }

  const changes = report ? report.totals.create + report.totals.update : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        back
        title="Import products"
        description="Upload a CSV with one row per size. Use an export as the template: columns you leave out keep their current values; photos are managed in the editor."
        action={
          <AButton asChild variant="outline">
            <a href="/api/admin/catalog/export" download>
              <AIcon icon={Download04Icon} /> Download current CSV
            </a>
          </AButton>
        }
      />

      <Card title="1. Choose a file">
        <div className="space-y-3 text-sm">
          <label className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 font-medium hover:bg-accent", busy && "pointer-events-none opacity-50")}>
            <AIcon icon={FileImportIcon} />
            {file ? "Choose another file" : "Choose CSV file"}
            <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(e) => void choose(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
          </label>
          {file ? <p className="text-muted-foreground">{file.name}</p> : null}
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Required columns: product_name, colour, colour_sku, size. Leave style_id empty for a new product.</li>
            <li>Prices in rupees (1499 or 1499.50). Tags and specs separated by “|”; specs as “Collar: Spread”.</li>
            <li>stock is the opening stock of new sizes only. Existing stock changes in Inventory.</li>
            <li>Nothing is saved until you press Apply. Each product is saved completely or not at all.</li>
          </ul>
        </div>
      </Card>

      {busy && !report ? <div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" /> : null}

      {report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={FileImportIcon} tint="emerald" value={report.totals.create} label="New products" />
            <KpiCard icon={FileImportIcon} tint="blue" value={report.totals.update} label="Products to update" />
            <KpiCard icon={FileImportIcon} tint="purple" value={report.totals.unchanged} label="Unchanged" />
            <KpiCard icon={FileImportIcon} tint="amber" value={report.totals.errors} label="Errors" hint={`${report.totals.rows} rows read`} />
          </div>

          {report.errors.length ? (
            <Card title="Fix these and upload again">
              <ul className="space-y-1.5 text-sm text-red-600 dark:text-red-400">
                {report.errors.slice(0, 100).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              {report.errors.length > 100 ? <p className="mt-2 text-xs text-muted-foreground">…and {report.errors.length - 100} more.</p> : null}
            </Card>
          ) : null}

          <Card title={report.applied ? "2. Result" : "2. Review and apply"}>
            {report.applied ? (
              <p className="text-sm">{report.ok ? "Done. The store shows the changes within a few seconds." : "Some products failed (listed above); the others were saved. Fix the rows and upload the file again — saved products show as unchanged."}</p>
            ) : report.ok ? (
              changes === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to change — the file matches the catalogue.</p>
              ) : (
                <Confirm
                  trigger={<AButton disabled={busy}>Apply: {changes} product{changes === 1 ? "" : "s"}</AButton>}
                  title="Apply this import?"
                  description={`${report.totals.create} new and ${report.totals.update} updated products. Live colours change on the store straight away. Every change is recorded in the audit log.`}
                  confirmLabel="Apply"
                  onConfirm={() => run(file!.text, true)}
                />
              )
            ) : (
              <p className="text-sm text-muted-foreground">Apply is available when the file has no errors.</p>
            )}
          </Card>

          <DataTable
            rows={report.groups}
            rowKey={(g) => g.rows}
            empty={{ title: "No products in the file", description: "Check that the file has rows below the header." }}
            columns={[
              { key: "r", header: "Rows", cell: (g) => <span className="tabular-nums">{g.rows}</span> },
              {
                key: "t",
                header: "Product",
                cell: (g) =>
                  g.styleId && g.action !== "error" && g.action !== "create" ? (
                    <Link href={`/admin/catalog/style/${g.styleId}`} className="hover:underline">
                      {g.title}
                    </Link>
                  ) : (
                    g.title || "—"
                  ),
              },
              { key: "c", header: "Colours · sizes", cell: (g) => `${g.colours} · ${g.sizes}` },
              { key: "a", header: "Action", cell: (g) => <StatusBadge status={g.action} tone={TONE[g.action]} label={g.action} /> },
              { key: "e", header: "", cell: (g) => (g.error ? <span className="text-xs text-red-600 dark:text-red-400">{g.error}</span> : null) },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}
