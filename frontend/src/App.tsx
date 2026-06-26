import { ErrorBoundary } from './components/ErrorBoundary'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider, RequireAuth } from './context/AuthContext'
import { ChecklistPage } from './pages/ChecklistPage'
import { ForumFormattingPage } from './pages/ForumFormattingPage'
import { JudgeForumListPage } from './pages/JudgeForumListPage'
import { AccessGuidePage } from './pages/AccessGuidePage'
import { ActivityLogPage } from './pages/ActivityLogPage'
import { AssignPage } from './pages/AssignPage'
import { QuestionBankDetailPage } from './pages/QuestionBankDetailPage'
import { QuestionBankReviewPage } from './pages/QuestionBankReviewPage'
import { QuestionBanksPage } from './pages/QuestionBanksPage'
import { DevPage } from './pages/DevPage'
import { DevLeadershipPage } from './pages/DevLeadershipPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { StaffPage } from './pages/StaffPage'
import { StaffMemberPage } from './pages/StaffMemberPage'
import { LeadersPage } from './pages/LeadersPage'
import { LeaderMemberPage } from './pages/LeaderMemberPage'
import { TasksPage } from './pages/TasksPage'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/access" element={<AccessGuidePage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/staff/:vkId" element={<StaffMemberPage />} />
          <Route path="/leaders" element={<LeadersPage />} />
          <Route path="/leaders/:vkId" element={<LeaderMemberPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TasksPage />} />
          <Route path="/checklist" element={<ChecklistPage />} />
          <Route path="/question-banks" element={<QuestionBanksPage />} />
          <Route path="/question-banks/review" element={<QuestionBankReviewPage />} />
          <Route path="/question-banks/:id" element={<QuestionBankDetailPage />} />
          <Route path="/assign" element={<AssignPage />} />
          <Route path="/activity" element={<ActivityLogPage />} />
          <Route path="/forum/judge-list" element={<JudgeForumListPage />} />
          <Route path="/forum/formatting" element={<ForumFormattingPage />} />
          <Route path="/forum/judge-assign" element={<Navigate to="/assign?type=judge" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:id/tasks/:taskId" element={<ProjectDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/dev" element={<DevPage />} />
          <Route path="/dev/leadership" element={<DevLeadershipPage />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
