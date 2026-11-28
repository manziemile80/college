import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { RequirePermission } from "@/components/auth/RequirePermission";
import Index from "./pages/Index";
import Login from "./pages/Login";
import CheckMarks from "./pages/CheckMarks";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import Classes from "./pages/Classes";
import Parents from "./pages/Parents";
import Scores from "./pages/Scores";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Forbidden from "./pages/Forbidden";
import Subjects from "./pages/Subjects";
import Marks from "./pages/Marks";
import Attendance from "./pages/Attendance";
import AcademicReports from "./pages/AcademicReports";
import Courses from "./pages/Courses";
import Materials from "./pages/Materials";
import Assignments from "./pages/Assignments";
import Quizzes from "./pages/Quizzes";
import Stock from "./pages/Stock";
import StockDashboard from "./pages/StockDashboard";
import StockIn from "./pages/stock/StockIn";
import StockOut from "./pages/stock/StockOut";
import StockBatches from "./pages/stock/StockBatches";
import StockExpiry from "./pages/stock/StockExpiry";
import StockAlerts from "./pages/stock/StockAlerts";
import StockMovements from "./pages/stock/StockMovements";
import StockReports from "./pages/stock/StockReports";
import StockValuation from "./pages/stock/StockValuation";
import Discipline from "./pages/Discipline";
import EnrollmentPage from "./pages/Enrollment";
import Certificates from "./pages/Certificates";
import Notifications from "./pages/Notifications";

const queryClient = new QueryClient();

/** Every protected route is gated by a database-backed permission. */
const guard = (permission: Parameters<typeof RequirePermission>[0]['permission'], element: React.ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/check-marks" element={<CheckMarks />} />
              <Route path="/forbidden" element={<Forbidden />} />

              <Route path="/dashboard" element={guard('dashboard.view', <Dashboard />)} />
              <Route path="/students" element={guard('students.view', <Students />)} />
              <Route path="/classes" element={guard('classes.view', <Classes />)} />
              <Route path="/parents" element={guard('students.manage', <Parents />)} />
              <Route path="/scores" element={guard('scores.behavior.view', <Scores />)} />
              <Route path="/reports" element={guard('reports.behavior.view', <Reports />)} />
              <Route path="/subjects" element={guard('subjects.view', <Subjects />)} />
              <Route path="/marks" element={guard(['marks.enter', 'marks.review'], <Marks />)} />
              <Route path="/attendance" element={guard('attendance.view', <Attendance />)} />
              <Route path="/academic-reports" element={guard('reports.academic.view', <AcademicReports />)} />
              <Route path="/courses" element={guard('courses.view', <Courses />)} />
              <Route path="/materials" element={guard('materials.view', <Materials />)} />
              <Route path="/assignments" element={guard('assignments.view', <Assignments />)} />
              <Route path="/quizzes" element={guard('quizzes.view', <Quizzes />)} />

              <Route path="/stock" element={guard('stock.manage', <Stock />)} />
              <Route path="/stock-dashboard" element={guard('stock.view', <StockDashboard />)} />
              <Route path="/stock/in" element={guard('stock.manage', <StockIn />)} />
              <Route path="/stock/out" element={guard('stock.manage', <StockOut />)} />
              <Route path="/stock/batches" element={guard('stock.view', <StockBatches />)} />
              <Route path="/stock/expiry" element={guard('stock.view', <StockExpiry />)} />
              <Route path="/stock/alerts" element={guard('stock.view', <StockAlerts />)} />
              <Route path="/stock/movements" element={guard('stock.view', <StockMovements />)} />
              <Route path="/stock/reports" element={guard('stock.reports', <StockReports />)} />
              <Route path="/stock/valuation" element={guard('stock.reports', <StockValuation />)} />

              <Route path="/discipline" element={guard('discipline.view', <Discipline />)} />
              <Route path="/enrollment" element={guard('enrollment.view', <EnrollmentPage />)} />
              <Route path="/certificates" element={guard(['certificates.request', 'certificates.view', 'certificates.approve'], <Certificates />)} />
              <Route path="/notifications" element={guard('notifications.view', <Notifications />)} />
              <Route path="/users" element={guard('users.view', <Users />)} />
              <Route path="/settings" element={guard('profile.view', <Settings />)} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
