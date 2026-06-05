import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { uploadActions, useUploadTask, useUploadTasks } from '@/features/file-manager/stores/upload-store'
import { cn } from '@/utils/cn'

export function UploadTaskList() {
	const { t } = useTranslation()
	const tasks = useUploadTasks()

	if (tasks.length === 0) {
		return null
	}

	return (
		<div className="grid gap-2 rounded-lg border bg-card p-3">
			<div className="flex items-center justify-between gap-3">
				<div className="text-sm font-medium">{t('files.uploadTasks')}</div>
				<Button onClick={() => uploadActions.clearCompleted()} size="sm" variant="ghost">
					{t('files.clearCompleted')}
				</Button>
			</div>
			{tasks.map(task => (
				<UploadTaskRow key={task.id} taskID={task.id} />
			))}
		</div>
	)
}

interface UploadTaskRowProps {
	taskID: string
}

function UploadTaskRow({ taskID }: UploadTaskRowProps) {
	const task = useUploadTask(taskID)
	if (!task) {
		return null
	}
	const value = task.bytesTotal > 0
		? Math.round((task.bytesUploaded / task.bytesTotal) * 100)
		: 0

	return (
		<div className="grid gap-1">
			<div className="flex items-center justify-between gap-3 text-xs">
				<span className="truncate">{task.fileName}</span>
				<span className="text-muted-foreground">{task.status}</span>
			</div>
			<Progress
				className={cn(task.status === 'failed' && 'bg-destructive/20 [&_[data-slot=progress-indicator]]:bg-destructive')}
				value={value}
			/>
		</div>
	)
}
