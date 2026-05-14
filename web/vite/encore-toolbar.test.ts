import type { ResolvedConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import { encoreToolbar } from './encore-toolbar'

function resolvePlugin(command: 'build' | 'serve') {
	const plugin = encoreToolbar()

	plugin.configResolved?.({ command } as ResolvedConfig)

	return plugin
}

describe('encoreToolbar', () => {
	it('injects the Encore toolbar script during local development', () => {
		const plugin = resolvePlugin('serve')

		expect(plugin.transformIndexHtml?.('', {} as never)).toEqual([
			{
				attrs: {
					src: 'https://encore.dev/encore-toolbar.js',
				},
				injectTo: 'head-prepend',
				tag: 'script',
			},
		])
	})

	it('does not inject the toolbar into production builds', () => {
		const plugin = resolvePlugin('build')

		expect(plugin.transformIndexHtml?.('', {} as never)).toEqual([])
	})
})
