import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatPage from './components/ChatPage';
import GeneratePage from './components/GeneratePage';
import ProjectPage from './components/ProjectPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:conversationId" element={<ChatPage />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/generate" element={<GeneratePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
