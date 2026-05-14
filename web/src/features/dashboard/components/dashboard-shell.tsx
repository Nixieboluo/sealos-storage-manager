import { useQuery } from '@tanstack/react-query'
import { Database, FolderTree, ServerCog } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { dashboardStatusQuery } from '@/features/dashboard/api/status-query'
import { StorageFilterForm } from '@/features/dashboard/forms/storage-filter-form'
import { useDashboardViewMode } from '@/features/dashboard/stores/dashboard-view-store'

const structureItems = [
	'src/app',
	'src/components/ui',
	'src/features',
	'src/services/encore',
	'src/store',
	'src/styles',
]

export function DashboardShell() {
	const statusQuery = useQuery(dashboardStatusQuery)
	const viewMode = useDashboardViewMode()

	return (
		<main className="min-h-screen bg-background text-foreground">
			<section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
				<header className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
					<div className="space-y-2">
						<p className="text-sm font-medium text-muted-foreground">
							Frontend scaffold
						</p>
						<h1 className="text-3xl font-semibold tracking-normal">
							Sealos Storage Manager
						</h1>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button size="sm" variant="outline">
							<FolderTree />
							Template ready
						</Button>
						<Button size="sm">
							<ServerCog />
							Encore SDK
						</Button>
					</div>
				</header>

				<div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
					<section className="grid gap-4 sm:grid-cols-3">
						<StatusTile
							description="Vite + React + Tailwind CSS v4"
							label="Stack"
							value="latest"
						/>
						<StatusTile
							description="Query, Form, Store, Devtools"
							label="TanStack"
							value="wired"
						/>
						<StatusTile
							description={statusQuery.data?.compatibility ?? 'loading'}
							label="Chrome"
							value="86"
						/>
					</section>

					<StorageFilterForm />
				</div>

				<section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
					<div className="rounded-lg border bg-card p-5 text-card-foreground">
						<div className="mb-4 flex items-center gap-2">
							<Database className="size-4" />
							<h2 className="text-base font-semibold">SDK boundary</h2>
						</div>
						<p className="text-sm leading-6 text-muted-foreground">
							Encore generated client output is reserved at
							<code className="mx-1 rounded bg-muted px-1 py-0.5">
								src/services/encore/client.ts
							</code>
							and can be refreshed with
							<code className="mx-1 rounded bg-muted px-1 py-0.5">
								pnpm generate:api
							</code>
							.
						</p>
					</div>

					<div className="rounded-lg border bg-card p-5 text-card-foreground">
						<div className="mb-4 flex items-center justify-between gap-4">
							<h2 className="text-base font-semibold">Project shape</h2>
							<span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
								{viewMode}
								{' '}
								view
							</span>
						</div>
						<div className="grid gap-2 sm:grid-cols-2">
							{structureItems.map(item => (
								<div
									className="rounded-md border bg-background px-3 py-2 font-mono text-sm"
									key={item}
								>
									{item}
								</div>
							))}
						</div>
					</div>
				</section>
			</section>
		</main>
	)
}

interface StatusTileProps {
	description: string
	label: string
	value: string
}

function StatusTile({ description, label, value }: StatusTileProps) {
	return (
		<div className="rounded-lg border bg-card p-5 text-card-foreground">
			<div className="text-sm text-muted-foreground">{label}</div>
			<div className="mt-2 text-2xl font-semibold">{value}</div>
			<p className="mt-3 text-sm leading-6 text-muted-foreground">
				{description}
			</p>
		</div>
	)
}
