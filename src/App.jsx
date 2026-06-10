import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import EmployeePortal from './pages/EmployeePortal';
import AdminDashboard from './pages/AdminDashboard';
import AdminCreateCourse from './pages/AdminCreateCourse';
import AdminEmployees from './pages/AdminEmployees';
import AdminUsers from './pages/AdminUsers';
import UserCalendar from './pages/UserCalendar';
import ApproverPortal from './pages/ApproverPortal';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <div className="app-shell min-h-screen text-gray-900 font-sans antialiased">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* หน้าพนักงาน — ต้อง login */}
          <Route path="/portal" element={<ProtectedRoute><EmployeePortal /></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute><UserCalendar /></ProtectedRoute>} />
          <Route path="/approve" element={<ProtectedRoute><ApproverPortal /></ProtectedRoute>} />

          {/* หน้า Admin — ต้องเป็น admin */}
          <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/manage-classes" element={<ProtectedRoute requireAdmin><ApproverPortal adminMode /></ProtectedRoute>} />
          <Route path="/admin/employees" element={<ProtectedRoute requireAdmin><AdminEmployees /></ProtectedRoute>} />
          <Route path="/admin/create" element={<ProtectedRoute requireAdmin><AdminCreateCourse /></ProtectedRoute>} />
          <Route path="/admin/edit/:id" element={<ProtectedRoute requireAdmin><AdminCreateCourse /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
