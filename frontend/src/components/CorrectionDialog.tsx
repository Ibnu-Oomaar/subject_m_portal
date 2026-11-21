import { useEffect, useState } from 'react';
import { FieldError } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** Finalized marks (and anything in a closed academic year) can only change with a written reason, kept in the audit trail. */
export function CorrectionDialog({ open, onOpenChange, count, loading, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; count: number; loading?: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);
  const trimmed = reason.trim().replace(/\s+/g, ' ');
  const problem = trimmed.length < 5 ? 'Explain the correction in at least 5 characters.' : trimmed.length > 500 ? 'Keep the reason under 500 characters.' : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!problem) onSubmit(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>Correct finalized marks</DialogTitle>
            <DialogDescription>
              You are changing {count === 1 ? '1 record' : `${count} records`} that {count === 1 ? 'is' : 'are'} finalized or belong to a closed academic year. The old and new values are kept in the history together with your reason.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="reason" className="mb-1.5">Reason for the correction</Label>
            <Textarea id="reason" autoFocus value={reason} maxLength={500} aria-invalid={touched && !!problem} onChange={(e) => setReason(e.target.value)} placeholder="For example: marks were transcribed from the wrong script." />
            <FieldError>{touched ? problem : null}</FieldError>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
            <Button type="submit" loading={loading}>Save correction</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
