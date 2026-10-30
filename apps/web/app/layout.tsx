import { Outlet } from "react-router";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";

export default function RootLayout() {
	return (
		// The notification channel rides OUTSIDE everything: sidebar, dock,
		// and pages all subscribe to it.
		<ServerEventsProvider>
			<AppearanceProvider>
				<SidebarProvider>
					<ActivityProvider>
						<AppShell>
							<Outlet />
						</AppShell>
					</ActivityProvider>
				</SidebarProvider>
			</AppearanceProvider>
		</ServerEventsProvider>
	);
}
