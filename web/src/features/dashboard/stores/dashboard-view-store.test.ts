import type { DashboardViewMode } from '@/features/dashboard/stores/dashboard-view-store'

import { describe, expect, it } from 'vitest'
import {
	dashboardViewStore,

} from '@/features/dashboard/stores/dashboard-view-store'

describe('dashboardViewStore', () => {
	it('updates keyword and view mode', () => {
		dashboardViewStore.setState(() => ({
			keyword: '',
			mode: 'grid' satisfies DashboardViewMode,
		}))

		dashboardViewStore.actions.setKeyword('archive')
		dashboardViewStore.actions.setMode('list')

		expect(dashboardViewStore.state).toEqual({
			keyword: 'archive',
			mode: 'list',
		})
	})
})
