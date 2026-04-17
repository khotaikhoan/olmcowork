import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// Bundled brand fonts — works fully offline (Electron desktop) without
// hitting the Google Fonts CDN. Each import injects an @font-face rule.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";

import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
