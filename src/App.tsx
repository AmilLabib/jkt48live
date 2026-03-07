import { BrowserRouter, Route, Routes } from "react-router-dom";
import RoomPage from "./pages/RoomPage";
import HomePage from "./pages/HomePage";
import IdnRoomPage from "./pages/IdnRoomPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/idn/:username" element={<IdnRoomPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
