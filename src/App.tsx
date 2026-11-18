import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { TaskDetail } from "./pages/TaskDetail";
import { TaskList } from "./pages/TaskList";
import { WorkflowSettings } from "./pages/WorkflowSettings";

export function App() {
  return (
    <>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<TaskList />} />
          <Route path="/task/:taskId" element={<TaskDetail />} />
          <Route path="/workflow-settings" element={<WorkflowSettings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <UpdatePrompt />
    </>
  );
}
