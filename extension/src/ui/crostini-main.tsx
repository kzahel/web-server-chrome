import ReactDOM from "react-dom/client";
import { CrostiniController } from "./crostini";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
ReactDOM.createRoot(root).render(<CrostiniController />);
