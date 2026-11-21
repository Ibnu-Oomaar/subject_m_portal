import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Banner, ConfirmDialog, EmptyState, FieldError, PageHeader, StatCard } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspace } from '@/hooks/useWorkspace';
import { ApiError, api, errorMessage } from '@/lib/api';
import { plural } from '@/lib/format';
import { invalidateResults } from '@/lib/queryClient';
import type { ImportPreview, ImportPreviewRow, ImportResult } from '@/lib/types';

const MAX_BYTES = 5 * 1024 * 1024;
const FILTERS = ['all', 'errors', 'warnings'] as const;
type Filter = (typeof FILTERS)[number];

function fileProblem(file: File): string | null {
  if (!/\.(xlsx|csv)$/i.test(file.name)) return 'Choose an Excel (.xlsx) or CSV (.csv) file.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_BYTES) return 'This file is larger than 5 MB. Split it into smaller files.';
  return null;
}
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function readStoredYear(): string | null {
  try {
    return localStorage.getItem('mp-import-year');
  } catch {
    return null;
  }
}

function RowStatus({ row }: { row: ImportPreviewRow }) {
  if (row.status === 'error') return <Badge variant="destructive">Error</Badge>;
  return <Badge variant={row.status === 'new' ? 'info' : 'default'}>{row.status === 'new' ? 'New' : 'Returning'}</Badge>;
}

export default function ImportStudents() {
  const { years, year: workspaceYear } = useWorkspace();
  const open = useMemo(() => years.filter((y) => y.status !== 'closed'), [years]);
  const [yearChoice, setYearChoice] = useState<string | null>(readStoredYear);
  const yearId = open.find((y) => y.id === yearChoice)?.id ?? open.find((y) => y.id === workspaceYear?.id)?.id ?? open.find((y) => y.status === 'active')?.id ?? open[0]?.id ?? '';
  const year = open.find((y) => y.id === yearId);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewedAt, setPreviewedAt] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!preview) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [preview]);

  const reset = () => {
    setFile(null);
    setFileError(null);
    setPreview(null);
    setResult(null);
    setSkipInvalid(false);
    setFilter('all');
    if (inputRef.current) inputRef.current.value = '';
  };

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const problem = fileProblem(f);
    setFileError(problem);
    setFile(problem ? null : f);
    setPreview(null);
  };

  const makePreview = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('academicYearId', yearId);
      form.append('file', file!);
      return api.upload<ImportPreview>('/imports/students/preview', form);
    },
    onSuccess: (p) => {
      setPreview(p);
      setPreviewedAt(Date.now());
      setNow(Date.now());
      setSkipInvalid(false);
      setFilter(p.summary.withErrors > 0 ? 'errors' : 'all');
    },
    onError: (e) => {
      setPreview(null);
      setFileError(errorMessage(e));
    },
  });

  const commit = useMutation({
    mutationFn: () => api.post<ImportResult>('/imports/students/commit', { token: preview!.token, skipInvalid }),
    onSuccess: (r) => {
      setResult(r);
      setPreview(null);
      setConfirming(false);
      toast.success(`${plural(r.enrolled, 'student')} imported into ${year?.label ?? 'the academic year'}.`);
      void invalidateResults();
    },
    onError: (e) => {
      setConfirming(false);
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'IMPORT_EXPIRED' || code === 'IMPORT_STALE' || code === 'ACADEMIC_YEAR_CLOSED') setPreview(null); // the preview is no longer valid: start over from the same file
      toast.error('Nothing was imported', { description: errorMessage(e) });
    },
  });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  };

  const download = async () => {
    try {
      toast.success(`Downloaded ${await api.download('/imports/students/template')}`);
    } catch (e) {
      toast.error('Could not download the template', { description: errorMessage(e) });
    }
  };

  const rows = useMemo(() => {
    if (!preview) return [];
    if (filter === 'errors') return preview.rows.filter((r) => r.status === 'error');
    if (filter === 'warnings') return preview.rows.filter((r) => r.issues.some((i) => i.severity === 'warning'));
    return preview.rows;
  }, [preview, filter]);

  const minutesLeft = preview ? Math.max(0, Math.ceil((previewedAt + preview.expiresInSeconds * 1000 - now) / 60_000)) : 0;
  const blocked = !!preview && (preview.summary.importable === 0 || (preview.summary.withErrors > 0 && !skipInvalid));

  if (years.length > 0 && open.length === 0) {
    return <EmptyState icon={FileSpreadsheet} title="No open academic year" description="Every academic year is closed. Create a new one, or reopen a year, to import students." action={<Button asChild><Link to="/academic-years">Academic years</Link></Button>} />;
  }
  if (years.length === 0) {
    return <EmptyState icon={FileSpreadsheet} title="Create an academic year first" description="Students are imported into an academic year." action={<Button asChild><Link to="/academic-years">Create academic year</Link></Button>} />;
  }

  // ---- done ------------------------------------------------------------------------------------------------------
  if (result) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="items-center gap-4 p-8 text-center">
          <CheckCircle2 className="size-10 text-state-finalized" />
          <div>
            <h1 className="text-lg font-semibold">Import complete</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{plural(result.enrolled, 'student')} enrolled in {year?.label}.</p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 text-left">
            <StatCard label="New students" value={result.newStudents} />
            <StatCard label="Returning" value={result.returningStudents} />
            <StatCard label="Skipped rows" value={result.skippedRows} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild><Link to="/students">View students</Link></Button>
            <Button variant="outline" onClick={reset}>Import another file</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Import students"
        description="Upload an Excel or CSV file. You will see exactly what will happen, including every problem, before anything is saved. Existing students and marks are never overwritten or deleted."
        actions={<Button variant="outline" size="sm" onClick={() => void download()}><Download /> Download template</Button>}
      />

      {/* step 1 */}
      <Card className="mb-4 gap-4 p-4">
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Import into</Label>
            <Select value={yearId} onValueChange={(v) => { setYearChoice(v); setPreview(null); }}>
              <SelectTrigger aria-label="Academic year"><SelectValue /></SelectTrigger>
              <SelectContent>{open.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}{y.status === 'active' ? ' (active)' : ' (planned)'}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Closed years cannot receive imports.</p>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'bg-muted/30'}`}
          >
            <input ref={inputRef} type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Student file" onChange={(e) => pick(e.target.files?.[0])} />
            {file ? (
              <div className="flex items-center gap-2 text-[13px]">
                <FileSpreadsheet className="size-4 text-muted-foreground" />
                <span className="font-medium">{file.name}</span>
                <span className="text-muted-foreground">{kb(file.size)}</span>
                <Button variant="ghost" size="icon-sm" aria-label="Remove file" onClick={reset}><X /></Button>
              </div>
            ) : (
              <>
                <Upload className="size-5 text-muted-foreground" />
                <p className="text-[13px]">Drop a file here, or <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => inputRef.current?.click()}>browse</button></p>
                <p className="text-xs text-muted-foreground">.xlsx or .csv (UTF-8), up to 5 MB and 5,000 rows. Required columns: Student ID, Full Name, Class, Section.</p>
              </>
            )}
          </div>
        </div>
        {fileError && <FieldError>{fileError}</FieldError>}
        <div className="flex items-center gap-2">
          <Button disabled={!file || !yearId} loading={makePreview.isPending} onClick={() => makePreview.mutate()}>
            {preview ? <><RefreshCw /> Preview again</> : 'Preview import'}
          </Button>
          <span className="text-xs text-muted-foreground">Nothing is saved at this step.</span>
        </div>
      </Card>

      {/* step 2 */}
      {preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Rows in file" value={preview.summary.totalRows} />
            <StatCard label="Will be imported" value={preview.summary.importable} />
            <StatCard label="New students" value={preview.summary.new} />
            <StatCard label="Returning students" value={preview.summary.returning} hint="Already known from earlier years" />
            <StatCard label="Rows with errors" value={preview.summary.withErrors} className={preview.summary.withErrors ? 'border-destructive/40' : ''} />
          </div>

          <Card className="gap-2 p-4 text-[13px]">
            {preview.summary.bySection.length > 0 && (
              <p><span className="text-muted-foreground">By section: </span>{preview.summary.bySection.map((s) => `Class ${s.label}: ${s.count}`).join(' · ')}</p>
            )}
            {preview.columns.ignored.length > 0 && <p><span className="text-muted-foreground">Ignored columns: </span>{preview.columns.ignored.join(', ')}</p>}
            {preview.summary.withWarnings > 0 && <p className="flex items-center gap-1.5"><AlertTriangle className="size-3.5 text-state-partial" /> {plural(preview.summary.withWarnings, 'row')} with warnings. Warnings do not block the import.</p>}
            <p className="text-muted-foreground">This preview expires in {minutesLeft > 0 ? `about ${plural(minutesLeft, 'minute')}` : 'less than a minute'}.</p>
          </Card>

          {preview.truncated && <Banner tone="warning" icon={AlertTriangle}>The table below shows the first {preview.rows.length} rows only. The counts above cover the whole file, and every row will be checked again when you confirm.</Banner>}

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TabsList>
                  <TabsTrigger value="all">All rows</TabsTrigger>
                  <TabsTrigger value="errors">Errors ({preview.summary.withErrors})</TabsTrigger>
                  <TabsTrigger value="warnings">Warnings ({preview.summary.withWarnings})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {rows.length === 0 ? (
              <p className="p-6 text-center text-[13px] text-muted-foreground">{filter === 'errors' ? 'No rows with errors.' : filter === 'warnings' ? 'No rows with warnings.' : 'No rows.'}</p>
            ) : (
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-14">Row</TableHead><TableHead>Student ID</TableHead><TableHead>Full name</TableHead><TableHead>Class</TableHead><TableHead>Status</TableHead><TableHead>Problems</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.rowNumber} className={r.status === 'error' ? 'bg-destructive/5' : undefined}>
                        <TableCell className="tabular text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell className="tabular">{r.studentId || '—'}</TableCell>
                        <TableCell>{r.fullName || '—'}</TableCell>
                        <TableCell>{r.className && r.sectionLabel ? r.sectionLabel : '—'}</TableCell>
                        <TableCell><RowStatus row={r} /></TableCell>
                        <TableCell className="whitespace-normal">
                          {r.issues.length === 0 ? <span className="text-muted-foreground">—</span> : (
                            <ul className="space-y-0.5 text-xs">
                              {r.issues.map((i, n) => <li key={n} className={i.severity === 'error' ? 'text-destructive' : 'text-state-partial'}>{i.message}</li>)}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {/* step 3 */}
          <Card className="gap-3 p-4">
            {preview.summary.withErrors > 0 && (
              <div className="flex items-start gap-2">
                <Checkbox id="skip-invalid" checked={skipInvalid} onCheckedChange={(c) => setSkipInvalid(c === true)} className="mt-0.5" />
                <Label htmlFor="skip-invalid" className="block text-[13px] leading-snug font-normal">
                  Skip the {plural(preview.summary.withErrors, 'row')} with errors and import the other {preview.summary.importable}. Skipped rows are not saved; fix them in your file and import them later.
                </Label>
              </div>
            )}
            {preview.summary.importable === 0 && <p className="text-[13px] text-destructive">No row can be imported. Fix the errors in your file and upload it again.</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={blocked} onClick={() => setConfirming(true)}>Import {plural(preview.summary.importable, 'student')}</Button>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !o && !commit.isPending && setConfirming(false)}
        loading={commit.isPending}
        title={`Import ${plural(preview?.summary.importable ?? 0, 'student')}?`}
        confirmLabel="Import now"
        onConfirm={() => commit.mutate()}
        description={
          <p>
            {preview?.summary.new} new and {preview?.summary.returning} returning students will be enrolled in {year?.label}.
            {preview && preview.summary.withErrors > 0 ? ` ${plural(preview.summary.withErrors, 'row')} with errors will be skipped.` : ''} Existing marks are not changed.
          </p>
        }
      />
    </div>
  );
}
