import { describe, expect, it } from 'vitest'

import { joinPath, normalizePath, parentPath } from '../path'

describe('file Browser path helpers', () => {
	it('normalizes paths with URL-encoded segments', () => {
		expect(normalizePath(' /a folder/b.txt ')).toBe('/a%20folder/b.txt')
		expect(normalizePath('/')).toBe('/')
	})

	it('joins and resolves parent paths', () => {
		expect(joinPath('/docs', 'read me.md')).toBe('/docs/read%20me.md')
		expect(parentPath('/docs/readme.md')).toBe('/docs')
		expect(parentPath('/docs')).toBe('/')
	})
})
