import { AppProviders } from '@/app/providers/app-providers'
import { DashboardPage } from '@/pages/dashboard-page'

export function App() {
	return (
		<AppProviders>
			<DashboardPage />
		</AppProviders>
	)
}
