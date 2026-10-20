import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { homeFor } from './app/nav'
import { SessionProvider, useSession } from './app/session'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/Toast'
import type { Role } from './data/types'
import { AccessDeniedPage, NotFoundPage } from './pages/StatusPages'
import { AccountPage } from './pages/account/AccountPage'
import { DocumentDetailPage } from './pages/documents/DocumentDetailPage'
import { FacultyDirectoryPage } from './pages/info/FacultyDirectoryPage'
import { NoticesPage } from './pages/info/NoticesPage'
import { ForgotPasswordPage, SessionExpiredPage, SignInPage } from './pages/public/AuthPages'
import { HomePage } from './pages/public/HomePage'
import { DashboardPage } from './pages/requester/DashboardPage'
import { MyDocumentsPage } from './pages/requester/MyDocumentsPage'
import { NewRequestPage } from './pages/requester/NewRequestPage'
import { ForReviewPage } from './pages/reviewer/ForReviewPage'
import { ReviewedPage } from './pages/reviewer/ReviewedPage'
import { AllDocumentsPage } from './pages/secretary/AllDocumentsPage'
import { ArchivePage } from './pages/secretary/ArchivePage'
import { EmailLogPage } from './pages/secretary/EmailLogPage'
import { ExternalOfficesPage } from './pages/secretary/ExternalOfficesPage'
import { OverviewPage } from './pages/secretary/OverviewPage'
import { ReleasePage } from './pages/secretary/ReleasePage'
import { RequirementsCheckPage } from './pages/secretary/RequirementsCheckPage'
import { SettingsPage } from './pages/secretary/SettingsPage'
import { UserManagementPage } from './pages/secretary/UserManagementPage'

const REVIEWER_ROLES: Role[] = ['chairperson', 'dean', 'ids_principal', 'ovcaa', 'chancellor']

function Protected({ allowedRoles, children }: { allowedRoles?: Role[]; children: ReactNode }) {
  const { user } = useSession()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/access-denied" replace />
  }

  return <>{children}</>
}

function RoleHomeRedirect() {
  const { user } = useSession()
  if (!user) {
    return <Navigate to="/sign-in" replace />
  }
  return <Navigate to={homeFor(user.role)} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/session-expired" element={<SessionExpiredPage />} />
            <Route path="/access-denied" element={<AccessDeniedPage />} />

            {/* Protected Application Area */}
            <Route
              path="/app"
              element={
                <Protected>
                  <AppShell />
                </Protected>
              }
            >
              <Route index element={<RoleHomeRedirect />} />

              {/* Requester (Students and Faculty) */}
              <Route
                path="dashboard"
                element={
                  <Protected allowedRoles={['student', 'faculty']}>
                    <DashboardPage />
                  </Protected>
                }
              />
              <Route
                path="my-documents"
                element={
                  <Protected allowedRoles={['student', 'faculty']}>
                    <MyDocumentsPage />
                  </Protected>
                }
              />
              <Route
                path="requests/new"
                element={
                  <Protected allowedRoles={['student', 'faculty']}>
                    <NewRequestPage />
                  </Protected>
                }
              />

              {/* Document Details (Available to all authorized roles) */}
              <Route path="documents/:id" element={<DocumentDetailPage />} />

              {/* College Secretary */}
              <Route
                path="overview"
                element={
                  <Protected allowedRoles={['secretary']}>
                    <OverviewPage />
                  </Protected>
                }
              />
              <Route
                path="requirements-check"
                element={
                  <Protected allowedRoles={['secretary']}>
                    <RequirementsCheckPage />
                  </Protected>
                }
              />
              <Route
                path="release"
                element={
                  <Protected allowedRoles={['secretary']}>
                    <ReleasePage />
                  </Protected>
                }
              />
              <Route
                path="external-offices"
                element={
                  <Protected allowedRoles={['secretary']}>
                    <ExternalOfficesPage />
                  </Protected>
                }
              />
              <Route
                path="documents"
                element={
                  <Protected allowedRoles={['secretary']}>
                    <AllDocumentsPage />
                  </Protected>
                }
              />
              <Route
                path="archive"
                element={
                  <Protected allowedRoles={['secretary']}>
                    <ArchivePage />
                  </Protected>
                }
              />
              <Route
                path="email-log"
                element={
                  <Protected allowedRoles={['secretary']}>
                    <EmailLogPage />
                  </Protected>
                }
              />
              <Route
                path="users"
                element={
                  <Protected allowedRoles={['secretary']}>
                    <UserManagementPage />
                  </Protected>
                }
              />
              <Route
                path="settings"
                element={
                  <Protected allowedRoles={['secretary']}>
                    <SettingsPage />
                  </Protected>
                }
              />

              {/* Reviewing Officials (Chairperson, Dean, IDS Principal, OVCAA, Chancellor) */}
              <Route
                path="for-review"
                element={
                  <Protected allowedRoles={REVIEWER_ROLES}>
                    <ForReviewPage />
                  </Protected>
                }
              />
              <Route
                path="reviewed"
                element={
                  <Protected allowedRoles={REVIEWER_ROLES}>
                    <ReviewedPage />
                  </Protected>
                }
              />

              {/* Shared College Information */}
              <Route path="faculty-directory" element={<FacultyDirectoryPage />} />
              <Route path="notices" element={<NoticesPage />} />
              <Route path="account" element={<AccountPage />} />

              {/* In-app fallback */}
              <Route path="*" element={<NotFoundPage inApp />} />
            </Route>

            {/* Public fallback */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
