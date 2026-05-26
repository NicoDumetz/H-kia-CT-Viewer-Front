import { createBrowserRouter } from "react-router-dom";

import Home from "./view/Home";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
]);
