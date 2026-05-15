import { Buffer } from 'node:buffer'

import { expect, test } from '@playwright/test'

const destructive = process.env.E2E_RUN_DESTRUCTIVE === '1'
const storageClass = process.env.E2E_STORAGE_CLASS
const hasKubeconfig = Boolean(process.env.VITE_DEV_KUBECONFIG)

test.describe('real Storage Manager workflow', () => {
	test.skip(!destructive || !hasKubeconfig, 'Set VITE_DEV_KUBECONFIG and E2E_RUN_DESTRUCTIVE=1 to run real e2e.')

	test('creates, expands, opens, manages files, and deletes a real PVC', async ({ page }) => {
		const pvcName = `sm-e2e-${Date.now()}`
		await page.goto('/')

		await page.getByRole('button', { name: /create pvc|新建存储卷/i }).click()
		await page.getByLabel(/name|名称/i).fill(pvcName)
		await page.getByLabel(/capacity|容量/i).fill('1')
		if (storageClass) {
			await page.getByLabel(/storage class|存储类/i).click()
			await page.getByRole('option', { name: storageClass }).click()
		}
		await page.getByRole('button', { name: /^create$|^创建$/i }).click()

		await expect(page.getByText(pvcName)).toBeVisible({ timeout: 60_000 })

		await page.getByRole('button', { name: /more actions|更多操作/i }).click()
		await page.getByRole('menuitem', { name: /expand|扩容/i }).click()
		await page.getByRole('button', { name: /expand|扩容/i }).click()

		await expect(page.getByText(pvcName)).toBeVisible({ timeout: 60_000 })

		await page.getByRole('button', { name: /browse files|浏览文件/i }).click()
		await expect(page.getByRole('button', { name: /upload file|上传文件/i })).toBeEnabled({ timeout: 180_000 })

		await page.getByRole('button', { name: /new folder|新建文件夹/i }).click()
		await page.getByLabel(/folder name|文件夹名称/i).fill('docs')
		await page.getByRole('button', { name: /^create$|^创建$/i }).click()
		await expect(page.getByText('docs')).toBeVisible({ timeout: 30_000 })

		const smallFile = Buffer.from('hello from e2e')
		await page.getByRole('button', { name: /upload file|上传文件/i }).click()
		await page.locator('input[type=file]').setInputFiles({
			name: 'hello.txt',
			mimeType: 'text/plain',
			buffer: smallFile,
		})
		await page.getByRole('button', { name: /upload file|上传文件/i }).last().click()
		await expect(page.getByText('hello.txt')).toBeVisible({ timeout: 30_000 })

		const helloRow = page.getByRole('row').filter({ hasText: 'hello.txt' })
		await helloRow.getByRole('button', { name: /edit|编辑/i }).click()
		await expect(page.getByRole('dialog').getByText(/online file editor|在线文件编辑/i)).toBeVisible()
		await page.getByRole('textbox').fill('edited from e2e')
		await page.getByRole('button', { name: /^save$|^保存$/i }).click()
		await expect(page.getByRole('dialog')).toBeHidden({ timeout: 30_000 })

		const largeFile = Buffer.alloc(33 * 1024 * 1024, 't')
		await page.getByRole('button', { name: /upload file|上传文件/i }).click()
		await page.locator('input[type=file]').setInputFiles({
			name: 'large-tus.bin',
			mimeType: 'application/octet-stream',
			buffer: largeFile,
		})
		await page.getByRole('button', { name: /upload file|上传文件/i }).last().click()
		await expect(page.getByText('large-tus.bin')).toBeVisible({ timeout: 180_000 })

		await page.getByRole('row').filter({ hasText: 'hello.txt' }).getByRole('button', { name: /delete|删除/i }).click()
		await page.getByRole('button', { name: /^delete$|^删除$/i }).click()
		await expect(page.getByText('hello.txt')).toBeHidden({ timeout: 30_000 })

		await page.getByRole('tab', { name: /recycle bin|回收站/i }).click()
		await expect(page.getByText('hello.txt')).toBeVisible({ timeout: 30_000 })
		await page.getByRole('row').filter({ hasText: 'hello.txt' }).getByRole('button', { name: /restore|恢复/i }).click()
		await page.getByRole('button', { name: /^restore$|^恢复$/i }).click()
		await expect(page.getByText(/recycle bin is empty|回收站为空/i)).toBeVisible({ timeout: 30_000 })

		await page.getByRole('tab', { name: /file management|文件管理/i }).click()
		await page.getByRole('row').filter({ hasText: 'large-tus.bin' }).getByRole('button', { name: /delete|删除/i }).click()
		await page.getByRole('button', { name: /^delete$|^删除$/i }).click()
		await page.getByRole('tab', { name: /recycle bin|回收站/i }).click()
		await expect(page.getByText('large-tus.bin')).toBeVisible({ timeout: 30_000 })
		await page.getByRole('button', { name: /clear recycle bin|清空回收站/i }).click()
		await page.getByRole('button', { name: /clear recycle bin|清空回收站/i }).click()
		await expect(page.getByText(/recycle bin is empty|回收站为空/i)).toBeVisible({ timeout: 30_000 })

		await page.getByRole('tab', { name: /volumes|存储卷/i }).click()
		await page.getByRole('button', { name: /more actions|更多操作/i }).click()
		await page.getByRole('menuitem', { name: /delete|删除/i }).click()
		await page.getByLabel(/type pvc name|输入 PVC 名称/i).fill(pvcName)
		await page.getByRole('button', { name: /^delete$|^删除$/i }).click()
		await expect(page.getByText(pvcName)).toBeHidden({ timeout: 60_000 })
	})
})
