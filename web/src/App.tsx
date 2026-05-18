import { Routes, Route, Navigate } from "react-router-dom"
import { AppLayout } from "./components/AppLayout"
import { Login } from "./pages/Login"
import { Dashboard } from "./pages/Dashboard"
import { Tasks } from "./pages/Tasks"
import { Tags } from "./pages/Tags"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const token = localStorage.getItem("jwt")
    if (!token) return <Navigate to="/login" replace />
    return <>{children}</>
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route
                path="/*"
                element={
                    <ProtectedRoute>
                        <AppLayout>
                            <Routes>
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/tasks" element={<Tasks />} />
                                <Route path="/tags" element={<Tags />} />
                            </Routes>
                        </AppLayout>
                    </ProtectedRoute>
                }
            />
        </Routes>
    )
}
