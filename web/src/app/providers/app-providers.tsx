import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import { TanStackDevtoolsPanel } from '@/app/providers/tanstack-devtools-panel'
import { queryClient } from '@/services/query-client'

interface AppProvidersProps {
	children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
	return (
		<QueryClientProvider client={queryClient}>
			{children}
			<ReactQueryDevtools buttonPosition="bottom-left" initialIsOpen={false} />
			<TanStackDevtoolsPanel />
		</QueryClientProvider>
	)
}
