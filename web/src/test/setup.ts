import '@testing-library/jest-dom/vitest'

if (!window.matchMedia) {
	window.matchMedia = () =>
		({
			addEventListener: () => undefined,
			addListener: () => undefined,
			dispatchEvent: () => false,
			matches: false,
			media: '',
			onchange: null,
			removeEventListener: () => undefined,
			removeListener: () => undefined,
		}) as MediaQueryList
}
