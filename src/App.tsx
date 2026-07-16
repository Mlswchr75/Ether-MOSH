import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import Index from "./pages/Index";
import Edit from "./pages/Edit";

const App = () => (
  <HelmetProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/edit" element={<Edit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    <Toaster
      theme="dark"
      position="top-center"
      toastOptions={{
        className: "font-mono text-xs uppercase tracking-widest",
        style: { background: "hsl(266 24% 8%)", border: "1px solid hsl(266 15% 22%)", color: "hsl(280 20% 92%)" },
      }}
    />
  </HelmetProvider>
);

export default App;
