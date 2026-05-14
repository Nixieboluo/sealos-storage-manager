import type { Plugin } from 'vite'

const encoreToolbarScript = {
	attrs: {
		src: 'https://encore.dev/encore-toolbar.js',
	},
	injectTo: 'head-prepend',
	tag: 'script',
} as const

export function encoreToolbar(): Plugin {
	let command: 'build' | 'serve' = 'serve'

	return {
		name: 'encore-toolbar',
		configResolved(config) {
			command = config.command
		},
		transformIndexHtml() {
			if (command !== 'serve') {
				return []
			}

			return [encoreToolbarScript]
		},
	}
}
