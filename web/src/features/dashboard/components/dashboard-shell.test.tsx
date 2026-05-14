import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { DashboardShell } from '@/features/dashboard/components/dashboard-shell'
import { dashboardViewStore } from '@/features/dashboard/stores/dashboard-view-store'
import { renderWithProviders } from '@/test/render'

describe('dashboardShell', () => {
	it('renders scaffold status and project boundaries', async () => {
		renderWithProviders(<DashboardShell />)

		expect(
			screen.getByRole('heading', { name: 'Sealos Storage Manager' }),
		).toBeInTheDocument()
		expect(await screen.findByText('Chrome 86 polyfill build')).toBeVisible()
		expect(screen.getByText('src/services/encore/client.ts')).toBeVisible()
		expect(screen.getByText('src/components/ui')).toBeVisible()
	})

	it('submits the storage filter into the dashboard store', async () => {
		dashboardViewStore.setState(() => ({
			keyword: '',
			mode: 'grid',
		}))
		const user = userEvent.setup()

		renderWithProviders(<DashboardShell />)

		await user.type(screen.getByLabelText('Keyword'), 'bucket-a')
		await user.click(screen.getByRole('button', { name: 'Apply filter' }))

		expect(dashboardViewStore.state.keyword).toBe('bucket-a')
	})
})
