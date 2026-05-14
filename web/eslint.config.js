import antfu from '@antfu/eslint-config'

export default antfu({
	formatters: true,
	react: true,
	ignores: [
		'dist/**',
	],
	stylistic: {
		indent: 'tab',
	},
})
