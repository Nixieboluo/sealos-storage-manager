import { act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSessionHeartbeat } from '@/features/viewer/hooks/use-session-heartbeat'
import { createFakeViewerAPI } from '@/features/viewer/test/fakes'
import { renderHookWithProviders } from '@/test/render'

describe('useSessionHeartbeat', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it('sends heartbeat immediately and at the configured interval', async () => {
		vi.useFakeTimers()
		const heartbeatViewerSession = vi.fn().mockResolvedValue({})
		const api = createFakeViewerAPI({ heartbeatViewerSession })

		const { unmount } = renderHookWithProviders(() =>
			useSessionHeartbeat({
				api,
				enabled: true,
				intervalMs: 1000,
				viewerSessionID: 'vs_1',
			}),
		)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0)
		})
		expect(heartbeatViewerSession).toHaveBeenCalledTimes(1)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(2500)
		})
		expect(heartbeatViewerSession).toHaveBeenCalledTimes(3)

		unmount()
		await vi.advanceTimersByTimeAsync(1000)
		expect(heartbeatViewerSession).toHaveBeenCalledTimes(3)
	})

	it('does not restart the heartbeat loop when callback props change', async () => {
		vi.useFakeTimers()
		const heartbeatViewerSession = vi.fn().mockResolvedValue({})
		const api = createFakeViewerAPI({ heartbeatViewerSession })
		const firstOnError = vi.fn()
		const secondOnError = vi.fn()

		const { rerender } = renderHookWithProviders(
			({ onError }) =>
				useSessionHeartbeat({
					api,
					enabled: true,
					intervalMs: 1000,
					onError,
					viewerSessionID: 'vs_1',
				}),
			{ initialProps: { onError: firstOnError } },
		)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0)
		})
		expect(heartbeatViewerSession).toHaveBeenCalledTimes(1)

		rerender({ onError: secondOnError })
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0)
		})
		expect(heartbeatViewerSession).toHaveBeenCalledTimes(1)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000)
		})
		expect(heartbeatViewerSession).toHaveBeenCalledTimes(2)
	})

	it('uses the latest error callback without resetting the timer', async () => {
		vi.useFakeTimers()
		const failure = new Error('heartbeat failed')
		const heartbeatViewerSession = vi
			.fn()
			.mockResolvedValueOnce({})
			.mockRejectedValue(failure)
		const api = createFakeViewerAPI({ heartbeatViewerSession })
		const firstOnError = vi.fn()
		const secondOnError = vi.fn()

		const { rerender } = renderHookWithProviders(
			({ onError }) =>
				useSessionHeartbeat({
					api,
					enabled: true,
					intervalMs: 1000,
					onError,
					viewerSessionID: 'vs_1',
				}),
			{ initialProps: { onError: firstOnError } },
		)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0)
		})
		rerender({ onError: secondOnError })

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000)
		})

		expect(firstOnError).not.toHaveBeenCalled()
		expect(secondOnError).toHaveBeenCalledWith(failure)
	})

	it('restarts heartbeat when the viewer session changes', async () => {
		vi.useFakeTimers()
		const heartbeatViewerSession = vi.fn().mockResolvedValue({})
		const api = createFakeViewerAPI({ heartbeatViewerSession })

		const { rerender } = renderHookWithProviders(
			({ viewerSessionID }) =>
				useSessionHeartbeat({
					api,
					enabled: true,
					intervalMs: 1000,
					viewerSessionID,
				}),
			{ initialProps: { viewerSessionID: 'vs_1' } },
		)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0)
		})
		expect(heartbeatViewerSession).toHaveBeenLastCalledWith('vs_1')

		rerender({ viewerSessionID: 'vs_2' })
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0)
		})

		expect(heartbeatViewerSession).toHaveBeenCalledTimes(2)
		expect(heartbeatViewerSession).toHaveBeenLastCalledWith('vs_2')
	})
})
