import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { TaskDetail } from "./pages/TaskDetail";
import { TaskList } from "./pages/TaskList";

export function App() {
  return (
    <>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<TaskList />} />
          <Route path="/task/:taskId" element={<TaskDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <UpdatePrompt />
    </>
  );
}
