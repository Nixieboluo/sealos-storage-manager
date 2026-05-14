import { useForm } from '@tanstack/react-form'
import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { dashboardViewStore } from '@/features/dashboard/stores/dashboard-view-store'

interface StorageFilterFormValues {
	keyword: string
}

export function StorageFilterForm() {
	const form = useForm({
		defaultValues: {
			keyword: '',
		} satisfies StorageFilterFormValues,
		onSubmit: ({ value }) => {
			dashboardViewStore.actions.setKeyword(value.keyword)
		},
	})

	return (
		<form
			className="rounded-lg border bg-card p-5 text-card-foreground"
			onSubmit={(event) => {
				event.preventDefault()
				void form.handleSubmit()
			}}
		>
			<div className="mb-4 flex items-center gap-2">
				<Search className="size-4" />
				<h2 className="text-base font-semibold">Storage filter</h2>
			</div>

			<form.Field name="keyword">
				{field => (
					<label className="grid gap-2 text-sm">
						<span className="text-muted-foreground">Keyword</span>
						<input
							className="h-9 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
							name={field.name}
							onBlur={field.handleBlur}
							onChange={event => field.handleChange(event.target.value)}
							placeholder="bucket, path, session..."
							value={field.state.value}
						/>
					</label>
				)}
			</form.Field>

			<div className="mt-4 flex justify-end">
				<Button size="sm" type="submit">
					Apply filter
				</Button>
			</div>
		</form>
	)
}
