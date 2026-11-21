import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from '@/auth/RequireRole';
import { EmptyState, FullPageSpinner } from '@/components/common';
import { StudentLayout } from '@/layouts/StudentLayout';
import { TeacherLayout } from '@/layouts/TeacherLayout';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';

// Pages are split into separate bundles so the charts library only loads when a chart page is opened.
const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/teacher/Dashboard'));
const Assessments = lazy(() => import('@/pages/teacher/Assessments'));
const Examinations = lazy(() => import('@/pages/teacher/Examinations'));
const ExaminationDetail = lazy(() => import('@/pages/teacher/ExaminationDetail'));
const Students = lazy(() => import('@/pages/teacher/Students'));
const StudentProfilePage = lazy(() => import('@/pages/teacher/StudentProfile'));
const Analytics = lazy(() => import('@/pages/teacher/Analytics'));
const Rankings = lazy(() => import('@/pages/teacher/Rankings'));
const Reports = lazy(() => import('@/pages/teacher/Reports'));
const AcademicYears = lazy(() => import('@/pages/teacher/AcademicYears'));
const ImportStudents = lazy(() => import('@/pages/teacher/ImportStudents'));
const StudentDashboard = lazy(() => import('@/pages/student/StudentDashboard'));

function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md px-4">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="This address does not exist."
        action={
          <Button asChild variant="outline">
            <Link to="/">Go to the start page</Link>
          </Button>
        }
      />
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireRole role="teacher" />}>
          <Route element={<TeacherLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="assessments" element={<Assessments />} />
            <Route path="examinations" element={<Examinations />} />
            <Route path="examinations/:examId" element={<ExaminationDetail />} />
            <Route path="students" element={<Students />} />
            <Route path="students/:enrollmentId" element={<StudentProfilePage />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="rankings" element={<Rankings />} />
            <Route path="reports" element={<Reports />} />
            <Route path="academic-years" element={<AcademicYears />} />
            <Route path="import" element={<ImportStudents />} />
          </Route>
        </Route>
        <Route element={<RequireRole role="student" />}>
          <Route element={<StudentLayout />}>
            <Route path="student" element={<StudentDashboard />} />
          </Route>
        </Route>
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
