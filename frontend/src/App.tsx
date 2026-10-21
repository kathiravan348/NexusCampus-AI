import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DialogProvider } from './core/dialog';
import { AuthProvider } from './core/auth/AuthContext';
import { CommandPalette } from './core/navigation';
import { PageLoadingSkeleton, ModulePlaceholderPage } from './core/templates';

// Lazy-load all pages for optimal bundle splitting
const Login = React.lazy(() => import('./pages/auth/Login').then(m => ({ default: m.Login })));
const CampusSetup = React.lazy(() => import('./pages/tenant/CampusSetup').then(m => ({ default: m.CampusSetup })));
const Dashboard = React.lazy(() => import('./pages/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const CourseCatalogue = React.lazy(() => import('./pages/lms/CourseCatalogue').then(m => ({ default: m.CourseCatalogue })));
const CoursePlayer = React.lazy(() => import('./pages/lms/CoursePlayer').then(m => ({ default: m.CoursePlayer })));
const AuthoringStudio = React.lazy(() => import('./pages/lms/AuthoringStudio').then(m => ({ default: m.AuthoringStudio })));
const CourseBuilder = React.lazy(() => import('./pages/lms/CourseBuilder').then(m => ({ default: m.CourseBuilder })));
const QuizEngine = React.lazy(() => import('./pages/lms/QuizEngine').then(m => ({ default: m.QuizEngine })));
const AdmissionsPipeline = React.lazy(() => import('./pages/admissions/AdmissionsPipeline').then(m => ({ default: m.AdmissionsPipeline })));
const StudentProfile = React.lazy(() => import('./pages/students/StudentProfile').then(m => ({ default: m.StudentProfile })));
const Timetable = React.lazy(() => import('./pages/operations/Timetable').then(m => ({ default: m.Timetable })));
const StaffDirectory = React.lazy(() => import('./pages/hr/StaffDirectory').then(m => ({ default: m.StaffDirectory })));
const Finance = React.lazy(() => import('./pages/operations/Finance').then(m => ({ default: m.Finance })));

// Flagship 11 Module Suites (Batches 1, 2, 3)
const StudentDirectory = React.lazy(() => import('./pages/students/StudentDirectory').then(m => ({ default: m.StudentDirectory })));
const DailyAttendance = React.lazy(() => import('./pages/operations/DailyAttendance').then(m => ({ default: m.DailyAttendance })));
const Gradebook = React.lazy(() => import('./pages/academics/Gradebook').then(m => ({ default: m.Gradebook })));
const ParentPortal = React.lazy(() => import('./pages/portals/ParentPortal').then(m => ({ default: m.ParentPortal })));
const BroadcastHub = React.lazy(() => import('./pages/communications/BroadcastHub').then(m => ({ default: m.BroadcastHub })));
const HostelManagement = React.lazy(() => import('./pages/campus/HostelManagement').then(m => ({ default: m.HostelManagement })));
const CafeteriaPOS = React.lazy(() => import('./pages/commerce/CafeteriaPOS').then(m => ({ default: m.CafeteriaPOS })));
const FleetTracking = React.lazy(() => import('./pages/transport/FleetTracking').then(m => ({ default: m.FleetTracking })));
const PayrollDashboard = React.lazy(() => import('./pages/payroll/PayrollDashboard').then(m => ({ default: m.PayrollDashboard })));
const LibraryCatalog = React.lazy(() => import('./pages/library/LibraryCatalog').then(m => ({ default: m.LibraryCatalog })));
const AccreditationDashboard = React.lazy(() => import('./pages/governance/AccreditationDashboard').then(m => ({ default: m.AccreditationDashboard })));

// Flagship Batch 4 Modules
const PlacementHub = React.lazy(() => import('./pages/career/PlacementHub').then(m => ({ default: m.PlacementHub })));
const InventoryAssets = React.lazy(() => import('./pages/inventory/InventoryAssets').then(m => ({ default: m.InventoryAssets })));
const VisitorSecurity = React.lazy(() => import('./pages/security/VisitorSecurity').then(m => ({ default: m.VisitorSecurity })));
const StudentWellbeing = React.lazy(() => import('./pages/students/StudentWellbeing').then(m => ({ default: m.StudentWellbeing })));

function App() {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Listen for custom event triggered from anywhere (Topbar, Sidebar, shortcuts)
  useEffect(() => {
    const handleToggle = () => setIsCommandPaletteOpen(prev => !prev);
    window.addEventListener('toggle-command-palette', handleToggle);
    return () => window.removeEventListener('toggle-command-palette', handleToggle);
  }, []);

  return (
    <AuthProvider>
      <DialogProvider>
        <BrowserRouter>
          {/* Global Spotlight / Command Bar */}
          <CommandPalette 
            isOpen={isCommandPaletteOpen} 
            onClose={() => setIsCommandPaletteOpen(false)} 
          />

          <Suspense fallback={<PageLoadingSkeleton />}>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              
              {/* Core & Auth */}
              <Route path="/login" element={<Login />} />
              <Route path="/setup" element={<CampusSetup />} />
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Portal 2: Student Lifecycle & CRM */}
              <Route path="/admissions" element={<AdmissionsPipeline />} />
              <Route path="/students" element={<StudentDirectory />} />
              <Route path="/student/profile" element={<StudentProfile />} />
              <Route path="/students/wellbeing" element={<StudentWellbeing />} />
              <Route path="/portal/parent" element={<ParentPortal />} />
              <Route path="/communications/broadcast" element={<BroadcastHub />} />

              {/* Portal 3: Academics & LMS */}
              <Route path="/lms" element={<CourseCatalogue />} />
              <Route path="/lms/player" element={<CoursePlayer />} />
              <Route path="/lms/studio" element={<AuthoringStudio />} />
              <Route path="/lms/course-builder" element={<CourseBuilder />} />
              <Route path="/lms/quiz" element={<QuizEngine />} />
              <Route path="/academics/gradebook" element={<Gradebook />} />
              <Route path="/library/catalog" element={<LibraryCatalog />} />

              {/* Portal 4: Workforce & Governance */}
              <Route path="/hr/staff" element={<StaffDirectory />} />
              <Route path="/payroll/dashboard" element={<PayrollDashboard />} />
              <Route path="/accreditation/dashboard" element={<AccreditationDashboard />} />

              {/* Portal 5: Finance & Operations */}
              <Route path="/finance" element={<Finance />} />
              <Route path="/inventory/assets" element={<InventoryAssets />} />
              <Route path="/cafeteria/pos" element={<CafeteriaPOS />} />

              {/* Portal 6: Campus Life & Facilities */}
              <Route path="/operations/timetable" element={<Timetable />} />
              <Route path="/attendance/daily" element={<DailyAttendance />} />
              <Route path="/campus/hostel" element={<HostelManagement />} />
              <Route path="/transport/live" element={<FleetTracking />} />
              <Route path="/career/placement" element={<PlacementHub />} />
              <Route path="/security/visitors" element={<VisitorSecurity />} />

              {/* Dynamic Route for all 64 Product Modules */}
              <Route path="/modules/:moduleId" element={<ModulePlaceholderPage />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </DialogProvider>
    </AuthProvider>
  );
}

export default App;
