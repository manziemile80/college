import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
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
import { StockOnly } from "./components/auth/StockOnly";
import Discipline from "./pages/Discipline";
import EnrollmentPage from "./pages/Enrollment";

const queryClient = new QueryClient();

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
            <Route path="/check-marks" element={<CheckMarks />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/classes" element={<Classes />} />
            <Route path="/parents" element={<Parents />} />
            <Route path="/scores" element={<Scores />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/subjects" element={<Subjects />} />
            <Route path="/marks" element={<Marks />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/academic-reports" element={<AcademicReports />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/materials" element={<Materials />} />
            <Route path="/assignments" element={<Assignments />} />
            <Route path="/quizzes" element={<Quizzes />} />
            <Route path="/stock" element={<StockOnly><Stock /></StockOnly>} />
            <Route path="/stock-dashboard" element={<StockOnly><StockDashboard /></StockOnly>} />
            <Route path="/stock/in" element={<StockOnly><StockIn /></StockOnly>} />
            <Route path="/stock/out" element={<StockOnly><StockOut /></StockOnly>} />
            <Route path="/stock/batches" element={<StockOnly><StockBatches /></StockOnly>} />
            <Route path="/stock/expiry" element={<StockOnly><StockExpiry /></StockOnly>} />
            <Route path="/stock/alerts" element={<StockOnly><StockAlerts /></StockOnly>} />
            <Route path="/stock/movements" element={<StockOnly><StockMovements /></StockOnly>} />
            <Route path="/stock/reports" element={<StockOnly><StockReports /></StockOnly>} />
            <Route path="/stock/valuation" element={<StockOnly><StockValuation /></StockOnly>} />
            <Route path="/discipline" element={<Discipline />} />
            <Route path="/enrollment" element={<EnrollmentPage />} />
            <Route path="/users" element={<Users />} />
            <Route path="/settings" element={<Settings />} />
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
