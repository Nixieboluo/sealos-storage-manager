import { useSelector } from '@tanstack/react-store'
import { createStore } from '@tanstack/store'

export type DashboardViewMode = 'grid' | 'list'

interface DashboardViewState {
	keyword: string
	mode: DashboardViewMode
}

const initialDashboardViewState: DashboardViewState = {
	keyword: '',
	mode: 'grid',
}

export const dashboardViewStore = createStore(
	initialDashboardViewState,
	store => ({
		setKeyword: (keyword: string) =>
			store.setState(state => ({ ...state, keyword })),
		setMode: (mode: DashboardViewMode) =>
			store.setState(state => ({ ...state, mode })),
	}),
)

export function useDashboardViewMode() {
	return useSelector(dashboardViewStore, state => state.mode)
}

export function useDashboardKeyword() {
	return useSelector(dashboardViewStore, state => state.keyword)
}
