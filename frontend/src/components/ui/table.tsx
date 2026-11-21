import * as React from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, containerClassName, ...props }: React.ComponentProps<'table'> & { containerClassName?: string }) {
  return (
    <div className={cn('relative w-full overflow-x-auto', containerClassName)}>
      <table data-slot="table" className={cn('w-full caption-bottom text-[13px]', className)} {...props} />
    </div>
  );
}
export const TableHeader = ({ className, ...props }: React.ComponentProps<'thead'>) => <thead className={cn('[&_tr]:border-b', className)} {...props} />;
export const TableBody = ({ className, ...props }: React.ComponentProps<'tbody'>) => <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
export const TableRow = ({ className, ...props }: React.ComponentProps<'tr'>) => <tr className={cn('border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted', className)} {...props} />;
export const TableHead = ({ className, ...props }: React.ComponentProps<'th'>) => <th className={cn('h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground', className)} {...props} />;
export const TableCell = ({ className, ...props }: React.ComponentProps<'td'>) => <td className={cn('px-3 py-2 align-middle', className)} {...props} />;
