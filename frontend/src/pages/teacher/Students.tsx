import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, Upload, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState, ErrorState, FieldError, PageHeader, TableSkeleton } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDebounced } from '@/hooks/useDebounced';
import { useWorkspace } from '@/hooks/useWorkspace';
import { api, ApiError, errorMessage } from '@/lib/api';
import { plural } from '@/lib/format';
import { invalidateResults } from '@/lib/queryClient';
import type { Paged, StudentRow } from '@/lib/types';

const addSchema = z.object({ studentId: z.string().trim().min(1, 'Enter the Student ID').max(40, 'Too long'), fullName: z.string().trim().min(1, 'Enter the student’s name').max(150, 'Too long') });
const renameSchema = z.object({ fullName: addSchema.shape.fullName });
type AddForm = z.infer<typeof addSchema>;
type RenameForm = z.infer<typeof renameSchema>;

function AddStudentDialog({ open, onOpenChange, yearId, sectionId, sectionLabel }: { open: boolean; onOpenChange: (o: boolean) => void; yearId: string; sectionId: string; sectionLabel: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<AddForm>({ resolver: zodResolver(addSchema), defaultValues: { studentId: '', fullName: '' } });
  const { errors } = form.formState;
  useEffect(() => {
    if (open) {
      form.reset({ studentId: '', fullName: '' });
      setServerError(null);
    }
  }, [open, form]);
  const add = useMutation({
    mutationFn: (v: AddForm) => api.post<{ enrollmentId: string; studentId: string; fullName: string; existingStudent: boolean }>('/students', { academicYearId: yearId, sectionId, ...v }),
    onSuccess: (r) => {
      toast.success(r.existingStudent ? `${r.fullName} is a returning student and keeps their earlier history.` : `${r.fullName} was added.`);
      void invalidateResults();
      onOpenChange(false);
    },
    onError: (e) => setServerError(e instanceof ApiError && e.code === 'DUPLICATE' ? e.message : errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !add.isPending && onOpenChange(o)}>
      <DialogContent>
        <form noValidate className="grid gap-4" onSubmit={form.handleSubmit((v) => { setServerError(null); add.mutate(v); })}>
          <DialogHeader>
            <DialogTitle>Add a student to Class {sectionLabel}</DialogTitle>
            <DialogDescription>For several students at once, use Import students instead.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="sid" className="mb-1.5">Student ID</Label>
            <Input id="sid" autoFocus autoComplete="off" aria-invalid={!!errors.studentId} {...form.register('studentId')} />
            <FieldError>{errors.studentId?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="sname" className="mb-1.5">Full name</Label>
            <Input id="sname" autoComplete="off" aria-invalid={!!errors.fullName} {...form.register('fullName')} />
            <FieldError>{errors.fullName?.message}</FieldError>
          </div>
          {serverError && <FieldError>{serverError}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={add.isPending}>Cancel</Button>
            <Button type="submit" loading={add.isPending}>Add student</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ student, onClose }: { student: StudentRow | null; onClose: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<RenameForm>({ resolver: zodResolver(renameSchema), defaultValues: { fullName: '' } });
  useEffect(() => {
    if (student) {
      form.reset({ fullName: student.fullName });
      setServerError(null);
    }
  }, [student, form]);
  const rename = useMutation({
    mutationFn: (v: RenameForm) => api.patch(`/students/${student!.enrollmentId}`, v),
    onSuccess: () => {
      toast.success('Name updated.');
      void invalidateResults();
      onClose();
    },
    onError: (e) => setServerError(errorMessage(e)),
  });
  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && !rename.isPending && onClose()}>
      <DialogContent>
        <form noValidate className="grid gap-4" onSubmit={form.handleSubmit((v) => rename.mutate(v))}>
          <DialogHeader>
            <DialogTitle>Correct student name</DialogTitle>
            <DialogDescription>The Student ID ({student?.studentId}) never changes, and all marks stay linked to this student. The change is recorded.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="rname" className="mb-1.5">Full name</Label>
            <Input id="rname" autoFocus autoComplete="off" aria-invalid={!!form.formState.errors.fullName} {...form.register('fullName')} />
            <FieldError>{form.formState.errors.fullName?.message}</FieldError>
          </div>
          {serverError && <FieldError>{serverError}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={rename.isPending}>Cancel</Button>
            <Button type="submit" loading={rename.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Students() {
  const { yearId, sectionId, year, section } = useWorkspace();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<StudentRow | null>(null);
  const debounced = useDebounced(search.trim());
  useEffect(() => setPage(1), [debounced, yearId, sectionId]);

  const list = useQuery({
    queryKey: ['students', 'list', yearId, sectionId, page, debounced],
    queryFn: () => api.get<Paged<StudentRow>>('/students', { academicYearId: yearId, sectionId, search: debounced, page }),
    enabled: !!yearId && !!sectionId,
    placeholderData: keepPreviousData,
  });
  const download = (query: Record<string, string | undefined>) => void api.download('/exports/students', query).then((n) => toast.success(`Downloaded ${n}`)).catch((e) => toast.error(errorMessage(e)));
  const closed = year?.status === 'closed';

  if (!yearId || !sectionId) return <EmptyState icon={Users} title="Create an academic year first" description="Students are enrolled in an academic year." action={<Button asChild><Link to="/academic-years">Academic years</Link></Button>} />;

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div>
      <PageHeader
        title="Students"
        description={`Class ${section?.label} · ${year?.label}. Only students of the selected section are listed.`}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Download /> Export</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => download({ academicYearId: yearId, sectionId, scope: 'section' })}>This section</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => download({ academicYearId: yearId, sectionId, scope: 'class' })}>Whole class (all my sections)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => download({ academicYearId: yearId })}>All students, {year?.label}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => download({})}>All students, every academic year</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild variant="outline" size="sm"><Link to="/import"><Upload /> Import</Link></Button>
            <Button size="sm" onClick={() => setAdding(true)} disabled={closed} title={closed ? 'This academic year is closed' : undefined}><Plus /> Add student</Button>
          </>
        }
      />
      <div className="relative mb-3 w-full sm:w-72">
        <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or Student ID" className="pl-8" aria-label="Search students" />
      </div>
      <Card className="overflow-hidden p-0">
        {list.isPending ? (
          <TableSkeleton cols={4} />
        ) : list.isError ? (
          <div className="p-4"><ErrorState error={list.error} onRetry={() => void list.refetch()} /></div>
        ) : data!.items.length === 0 ? (
          <div className="p-4">
            {debounced ? <EmptyState icon={Search} title="No matching students" description={`Nobody in Class ${section?.label} matches “${debounced}”.`} /> : <EmptyState icon={Users} title={`No students in Class ${section?.label}`} description={`No students are enrolled in ${year?.label} for this section yet.`} action={!closed && <Button asChild><Link to="/import"><Upload /> Import students</Link></Button>} />}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-36">Student ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24">Section</TableHead>
                  <TableHead className="w-24 text-right"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.items.map((s) => (
                  <TableRow key={s.enrollmentId}>
                    <TableCell className="tabular text-muted-foreground">{s.studentId}</TableCell>
                    <TableCell className="font-medium"><Link to={`/students/${s.enrollmentId}`} className="hover:underline">{s.fullName}</Link></TableCell>
                    <TableCell>{s.sectionLabel}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" aria-label={`Correct name of ${s.fullName}`} onClick={() => setRenaming(s)} disabled={closed}><Pencil /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
              <span>{plural(data!.total, 'student')}{debounced ? ' found' : ''} · page {data!.page} of {pages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft /></Button>
                <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight /></Button>
              </div>
            </div>
          </>
        )}
      </Card>
      <AddStudentDialog open={adding} onOpenChange={setAdding} yearId={yearId} sectionId={sectionId} sectionLabel={section?.label ?? ''} />
      <RenameDialog student={renaming} onClose={() => setRenaming(null)} />
    </div>
  );
}
