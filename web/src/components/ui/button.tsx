import type { VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { Slot } from '@radix-ui/react-slot'

import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/utils/cn'

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<'button'>
	& VariantProps<typeof buttonVariants> & {
		asChild?: boolean
	}) {
	const Comp = asChild ? Slot : 'button'

	return (
		<Comp
			className={cn(buttonVariants({ variant, size, className }))}
			data-slot="button"
			{...props}
		/>
	)
}

export { Button }
