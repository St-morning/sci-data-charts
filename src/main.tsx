import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";
import {initializeWorkspace,storageWarning} from "@/lib/store";
import {toast} from "sonner";

const root=document.getElementById("root")!;
root.textContent="正在加载本机工作区…";
await initializeWorkspace();
createRoot(root).render(
  <StrictMode><App /></StrictMode>,
);
if(storageWarning())toast.error(storageWarning(),{duration:12000});
