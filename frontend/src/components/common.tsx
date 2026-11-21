import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Lock, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { STATE_LABELS, TREND_LABELS } from '@/lib/format';
import type { ResultState, Trend, YearStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg leading-tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const network = error instanceof ApiError && error.code === 'NETWORK';
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="size-5 text-destructive" />
      <p className="text-sm font-medium">{network ? 'Cannot reach the server' : title}</p>
      <p className="max-w-md text-[13px] text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          Try again
        </Button>
      )}
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn('h-7', c === 1 ? 'flex-[2]' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-28 rounded-xl', className)} />;
}

const STATE_VARIANT: Record<ResultState, 'muted' | 'warning' | 'info' | 'success'> = { missing: 'muted', partial: 'warning', entered: 'info', finalized: 'success' };
export function StateBadge({ state, className }: { state: ResultState; className?: string }) {
  return (
    <Badge variant={STATE_VARIANT[state]} className={className}>
      {state === 'finalized' && <Lock />}
      {STATE_LABELS[state]}
    </Badge>
  );
}

export function TrendBadge({ trend, delta }: { trend: Trend; delta?: number | null }) {
  if (trend === 'insufficient') return <span className="text-xs text-muted-foreground">{TREND_LABELS.insufficient}</span>;
  const Icon = trend === 'improving' ? ArrowUpRight : trend === 'declining' ? ArrowDownRight : ArrowRight;
  const variant = trend === 'improving' ? 'success' : trend === 'declining' ? 'destructive' : 'muted';
  return (
    <Badge variant={variant}>
      <Icon />
      {TREND_LABELS[trend]}
      {delta !== null && delta !== undefined && <span className="tabular opacity-80">({delta > 0 ? '+' : ''}{delta})</span>}
    </Badge>
  );
}

export function YearStatusBadge({ status }: { status: YearStatus }) {
  return <Badge variant={status === 'active' ? 'success' : status === 'closed' ? 'muted' : 'info'}>{status === 'active' ? 'Active' : status === 'closed' ? 'Closed' : 'Planned'}</Badge>;
}

export function StatCard({ label, value, hint, icon: Icon, className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <Card className={cn('gap-1 p-4', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {Icon && <Icon className="size-4" />}
      </div>
      <div className="tabular text-2xl leading-8 font-semibold tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function Banner({ tone = 'info', icon: Icon = Lock, children }: { tone?: 'info' | 'warning'; icon?: LucideIcon; children: ReactNode }) {
  return (
    <div role="status" className={cn('mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px]', tone === 'warning' ? 'border-state-partial/40 bg-state-partial/10' : 'border-state-entered/30 bg-state-entered/8')}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}
/** Used before anything hard to undo: finalizing, closing a year, deleting an examination, committing an import. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive, loading, onConfirm }: ConfirmProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            className={cn(destructive && buttonVariants({ variant: 'destructive' }))}
            onClick={(e) => {
              e.preventDefault(); // stay open while the request runs; the caller closes it
              onConfirm();
            }}
          >
            {loading && <span className="mr-1 size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-destructive">
      {children}
    </p>
  );
}
