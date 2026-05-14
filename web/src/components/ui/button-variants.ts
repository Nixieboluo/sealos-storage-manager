import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px] outline-none',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary',
				destructive:
          'bg-destructive text-white hover:bg-destructive focus-visible:ring-destructive',
				outline:
          'border bg-background hover:bg-accent hover:text-accent-foreground',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-9 px-4 py-2',
				sm: 'h-8 rounded-md px-3',
				lg: 'h-10 rounded-md px-6',
				icon: 'size-9',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)
