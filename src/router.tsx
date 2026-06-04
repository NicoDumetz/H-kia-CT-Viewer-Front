// =============================================================
//
// ██╗  ██╗███████╗██╗  ██╗██╗ █████╗
// ██║  ██║██╔════╝██║ ██╔╝██║██╔══██╗
// ███████║█████╗  █████╔╝ ██║███████║
// ██╔══██║██╔══╝  ██╔═██╗ ██║██╔══██║
// ██║  ██║███████╗██║  ██╗██║██║  ██║
// ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
//
// File        : router.tsx
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Thursday June 04 2026
//
// =============================================================

import { createBrowserRouter, Navigate } from "react-router-dom";

import Import from "./view/Import";
import Workspace from "./view/Workspace";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate replace to="/import" />,
  },
  {
    path: "/import",
    element: <Import />,
  },
  {
    path: "/studies/:studyId/workspace",
    element: <Workspace />,
  },
]);
