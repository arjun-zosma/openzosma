import { Skeleton } from "@/src/components/ui/skeleton"

const DashboardLoadingLayout = () => {
	return (
		<div className="flex w-full flex-1 flex-col overflow-hidden md:flex-row h-screen">
			{/* Mobile header skeleton */}
			<div className="flex md:hidden items-center justify-end h-10 px-4 bg-neutral-100 dark:bg-neutral-800">
				<Skeleton className="h-5 w-5 rounded" />
			</div>
			{/* Sidebar skeleton */}
			<div className="hidden md:flex md:flex-col w-[300px] shrink-0 bg-sidebar px-4 py-4 gap-6">
				{/* Logo */}
				<div className="flex items-center gap-2">
					<Skeleton className="h-5 w-6 rounded" />
					<Skeleton className="h-4 w-20" />
				</div>
				{/* Org switcher */}
				<Skeleton className="h-9 w-full rounded-md" />
				{/* Nav items */}
				<div className="flex flex-col gap-3">
					{[...Array(5)].map((_, i) => (
						<div key={i} className="flex items-center gap-2">
							<Skeleton className="h-5 w-5 rounded" />
							<Skeleton className="h-4 w-24" />
						</div>
					))}
				</div>
			</div>
			{/* Content skeleton */}
			<div className="flex-1 p-4 w-full h-full overflow-y-auto">
				<div className="flex flex-col w-full gap-6">
					<div className="flex flex-row w-full justify-between items-center">
						<Skeleton className="w-40 h-7" />
						<Skeleton className="w-36 h-9" />
					</div>
					<Skeleton className="w-full h-64 rounded-lg" />
				</div>
			</div>
		</div>
	)
}

export default DashboardLoadingLayout
