import { TanStackDevtools } from '@tanstack/react-devtools'
import { formDevtoolsPlugin } from '@tanstack/react-form-devtools'

const devtoolsPlugins = [formDevtoolsPlugin()]

export function TanStackDevtoolsPanel() {
	if (!import.meta.env.DEV) {
		return null
	}

	return (
		<TanStackDevtools
			config={{
				position: 'bottom-right',
				panelLocation: 'bottom',
				hideUntilHover: true,
			}}
			plugins={devtoolsPlugins}
		/>
	)
}
