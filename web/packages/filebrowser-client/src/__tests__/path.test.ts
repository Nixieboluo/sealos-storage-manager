import { describe, expect, it } from 'vitest'

import { encodePath, joinPath, normalizePath, parentPath } from '../path'

describe('file Browser path helpers', () => {
	it('normalizes paths without URL-encoding segments', () => {
		expect(normalizePath(' /a folder/b.txt ')).toBe('/a folder/b.txt')
		expect(normalizePath('/')).toBe('/')
	})

	it('encodes normalized paths only for request URLs', () => {
		expect(encodePath(' /a folder/中文/% done.txt ')).toBe('/a%20folder/%E4%B8%AD%E6%96%87/%25%20done.txt')
	})

	it('joins and resolves parent paths', () => {
		expect(joinPath('/docs', 'read me.md')).toBe('/docs/read me.md')
		expect(parentPath('/docs/readme.md')).toBe('/docs')
		expect(parentPath('/docs')).toBe('/')
	})
})
