import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import "katex/dist/katex.min.css";
import "./app/globals.css";
import RootLayout from "./app/layout";
import HomePage from "./app/page";
import NewSessionPage from "./app/chat/new/page";
import ChatPage from "./app/chat/[id]/page";
import { AuthGate } from "./lib/auth";

const router = createBrowserRouter([
	{
		element: <RootLayout />,
		children: [
			{ path: "/", element: <HomePage /> },
			{ path: "/chat/new", element: <NewSessionPage /> },
			{ path: "/chat/:id", element: <ChatPage /> },
			// Settings is a dialog over the app, not a page.
			{ path: "/settings", element: <Navigate to="/chat/new" replace /> },
			{ path: "*", element: <Navigate to="/" replace /> },
		],
	},
]);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<AuthGate>
			<RouterProvider router={router} />
		</AuthGate>
	</StrictMode>,
);
