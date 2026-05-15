import antfu from '@antfu/eslint-config'

export default antfu({
	formatters: true,
	react: true,
	ignores: [
		'dist/**',
		'packages/encore-client/src/generated/client.ts',
	],
	stylistic: {
		indent: 'tab',
	},
})
