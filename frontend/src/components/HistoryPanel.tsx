import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { ErrorState } from '@/components/common';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { fmtDateTime, fmtMarks } from '@/lib/format';
import type { HistoryItem } from '@/lib/types';

const ACTIONS: Record<string, string> = {
  'assessment.create': 'Entered',
  'assessment.update': 'Changed',
  'assessment.correction': 'Corrected after finalizing',
  'assessment.finalize': 'Finalized',
  'exam_mark.create': 'Entered',
  'exam_mark.update': 'Changed',
  'exam_mark.correction': 'Corrected after finalizing',
  'exam_mark.clear': 'Cleared',
  'exam_mark.finalize': 'Finalized',
};
const FIELDS: Record<string, string> = {
  classActivities: 'Class Activities',
  homeworkAssignments: 'Homeworks and Assignments',
  learningMaterialsNotebook: 'Learning Materials and Notebook',
  textbook: 'Textbook',
  total: 'Total',
  marks: 'Marks',
  status: 'Status',
};

const show = (v: unknown): string => (v === null || v === undefined ? 'empty' : typeof v === 'number' ? fmtMarks(v) : String(v));

/** Lists exactly which values changed, from what to what, by whom and when. */
function changes(item: HistoryItem): Array<{ field: string; from: string; to: string }> {
  const before = item.before ?? {};
  const after = item.after ?? {};
  return Object.keys({ ...before, ...after })
    .filter((k) => k in FIELDS && JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .map((k) => ({ field: FIELDS[k]!, from: show(before[k]), to: show(after[k]) }));
}

export function HistorySheet({ open, onOpenChange, title, description, queryKey, path, query }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; queryKey: unknown[]; path: string; query?: Record<string, string> }) {
  const history = useQuery({ queryKey, queryFn: () => api.get<HistoryItem[]>(path, query), enabled: open });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {history.isPending ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : history.data.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">No changes have been recorded yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l pl-4">
            {history.data.map((item) => {
              const diff = changes(item);
              return (
                <li key={item.id} className="relative">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-primary" />
                  <p className="text-[13px] font-medium">{ACTIONS[item.action] ?? item.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.actorName ?? 'System'} · {fmtDateTime(item.at)}
                  </p>
                  {diff.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs">
                      {diff.map((d) => (
                        <li key={d.field} className="flex flex-wrap items-center gap-1">
                          <span className="text-muted-foreground">{d.field}:</span>
                          <span className="tabular rounded bg-muted px-1">{d.from}</span>
                          <ArrowRight className="size-3 text-muted-foreground" />
                          <span className="tabular rounded bg-muted px-1 font-medium">{d.to}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.reason && <p className="mt-1.5 rounded-md bg-muted px-2 py-1.5 text-xs">Reason: {item.reason}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </SheetContent>
    </Sheet>
  );
}
