import { describe, expect, it } from 'vitest'

import {
	normalizeViewerError,
	translateViewerError,
	ViewerApiError,
	viewerErrorMessageKey,
	viewerErrorMessageKeys,
} from '@/features/viewer/api/viewer-error'
import { backendViewerErrorCodes } from '@/features/viewer/types/viewer'
import { createI18nInstance, resources } from '@/i18n'

describe('viewer errors', () => {
	it('maps every backend viewer error code to a translation key', () => {
		expect(Object.keys(viewerErrorMessageKeys).sort()).toEqual([...backendViewerErrorCodes].sort())
		for (const code of backendViewerErrorCodes) {
			expect(viewerErrorMessageKey(code)).not.toBe('errors.generic')
		}
	})

	it('has zh and en translations for every backend error code', () => {
		for (const code of backendViewerErrorCodes) {
			const key = viewerErrorMessageKey(code)
			expect(resources.en.translation).toHaveProperty(key)
			expect(resources.zh.translation).toHaveProperty(key)
		}
	})

	it('translates known errors and falls back for unknown codes', () => {
		const instance = createI18nInstance('en')
		const known = translateViewerError(
			new ViewerApiError({
				code: 'PVC_ACCESS_DENIED',
				message: 'denied',
				status: 403,
			}),
			instance.t,
		)

		expect(known).toContain('permission')
		expect(instance.t('errors.generic')).toBe(resources.en.translation.errors.generic)
	})

	it('normalizes unknown backend codes to a typed internal error', () => {
		const error = normalizeViewerError(new Error('network failed'))

		expect(error.code).toBe('INTERNAL_ERROR')
		expect(viewerErrorMessageKey(error.code)).toBe('errors.internalError')
	})
})
