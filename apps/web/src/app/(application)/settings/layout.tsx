"use client"

import { cn } from "@/src/lib/utils"
import { IconDatabase, IconSettings, IconUser } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const settingsnav = [
	{
		id: "general",
		label: "General",
		href: "",
		icon: IconSettings,
	},
	{
		id: "profile",
		label: "Profile",
		href: "/profile",
		icon: IconUser,
	},
	{
		id: "knowledge-base",
		label: "Knowledge Base",
		href: "/knowledge-base",
		icon: IconDatabase,
	},
]

const SettingsLayout = ({ children }: { children: React.ReactNode }) => {
	const pathname = usePathname()
	const basepath = "/settings"

	const isactive = (navhref: string) => {
		const fullpath = basepath + navhref
		if (navhref === "") {
			return pathname === basepath || pathname === `${basepath}/`
		}
		return pathname.startsWith(fullpath)
	}

	return (
		<div className="flex flex-col w-full h-full gap-6">
			{/* Header */}
			<div>
				<h4 className="text-xl font-semibold">Settings</h4>
				<p className="text-sm text-muted-foreground">Manage your account settings</p>
			</div>

			{/* Tab Navigation */}
			<div className="flex items-center gap-1 border-b">
				{settingsnav.map((item) => {
					const active = isactive(item.href)
					return (
						<Link
							key={item.id}
							href={`${basepath}${item.href}`}
							className={cn(
								"flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
								active
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
							)}
						>
							<item.icon className="size-4" />
							{item.label}
						</Link>
					)
				})}
			</div>

			{/* Content */}
			<div className="flex-1">{children}</div>
		</div>
	)
}

export default SettingsLayout
