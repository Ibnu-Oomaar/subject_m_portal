import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { ProfileView } from '@/components/ProfileView';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { StudentProfile } from '@/lib/types';

export default function StudentProfilePage() {
  const { enrollmentId } = useParams();
  const query = useQuery({ queryKey: ['profile', enrollmentId], queryFn: () => api.get<StudentProfile>(`/students/${enrollmentId}/profile`), enabled: !!enrollmentId });

  if (query.isPending) return <div className="space-y-3"><Skeleton className="h-8 w-72" /><div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-64" /></div>;
  if (query.isError) {
    const gone = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
    return gone ? <EmptyState title="Student not found" description="This student does not exist, or is not in one of your sections." action={<Button asChild variant="outline"><Link to="/students">Back to students</Link></Button>} /> : <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const p = query.data;
  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground"><Link to="/students"><ArrowLeft /> Students</Link></Button>
      <PageHeader
        title={p.student.fullName}
        description={`${p.student.studentId} · ${p.className} ${p.section.label} · ${p.academicYear.label}`}
        actions={<Button variant="outline" size="sm" onClick={() => void api.download('/exports/student-result', { enrollmentId }).then((n) => toast.success(`Downloaded ${n}`)).catch((e) => toast.error(errorMessage(e)))}><Download /> Export results</Button>}
      />
      <ProfileView profile={p} showFlags />
    </div>
  );
}
