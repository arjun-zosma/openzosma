"use client"

import ThemeSwitch from "@/src/components/molecules/theme-switch"
import ChatSidebar from "@/src/components/organisms/chat-sidebar"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/src/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar"
import {
	MobileSidebar,
	Sidebar as RootSidebar,
	SidebarBody,
	SidebarLink,
	useSidebar,
} from "@/src/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip"
import { useSession } from "@/src/lib/auth-client"
import { cn } from "@/src/lib/utils"
import { useSidebarStore } from "@/src/stores/sidebar-store"
import { getSidebarItems } from "@/src/utils/sidebar-items"
import { IconChevronLeft, IconChevronRight, IconLogout } from "@tabler/icons-react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

// ---------------------------------------------------------------------------
// SidebarContent
// ---------------------------------------------------------------------------

interface SidebarContentProps {
	collapsed: boolean
	threadpanelopen: boolean
	setthreadpanelopen: (open: boolean) => void
}

const SidebarContent = ({ collapsed, threadpanelopen, setthreadpanelopen }: SidebarContentProps) => {
	const { open, setOpen } = useSidebar()
	const { data } = useSession()
	const { user } = data ?? {}
	const { name, image } = user ?? {}
	const pathname = usePathname()
	const sidebarItems = getSidebarItems()
	const [signoutopen, setsignoutopen] = useState(false)

	// Close thread panel when navigating away from chat
	useEffect(() => {
		if (!pathname.includes("/chat")) {
			setthreadpanelopen(false)
		}
	}, [pathname, setthreadpanelopen])

	const ischatactive = pathname.includes("/chat")
	const isvisiblyexpanded = open

	return (
		<>
			<AnimatePresence mode="wait" initial={false}>
				{threadpanelopen ? (
					// ── Thread panel ──
					<motion.div
						key="threads"
						className="flex flex-col w-full h-full"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.14, delay: 0.08 }}
					>
						<ChatSidebar onClose={() => setthreadpanelopen(false)} />
					</motion.div>
				) : (
					// ── Normal nav ──
					<motion.div
						key="nav"
						className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto justify-between w-full"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.1 }}
					>
						<div className="flex flex-1 flex-col">
							{/* Header: Logo + Collapse (expanded) or Expand button (collapsed) */}
							<div className="flex items-center justify-between mb-1">
								{isvisiblyexpanded ? (
									<>
										<Logo />
										<button
											type="button"
											onClick={() => useSidebarStore.getState().setcollapsed(true)}
											className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
											aria-label="Collapse sidebar"
										>
											<IconChevronLeft className="size-4" />
										</button>
									</>
								) : (
									<button
										type="button"
										onClick={() => useSidebarStore.getState().setcollapsed(false)}
										className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
										aria-label="Expand sidebar"
									>
										<IconChevronRight className="size-4" />
									</button>
								)}
							</div>

							<div className="mt-4" />

							{/* Nav items — logout is handled in the footer */}
							<div className="flex flex-col gap-2">
								{sidebarItems
									.filter(({ id }) => id !== "logout")
									.map(({ id, hasflyout, ...item }) => {
										if (id === "chat" && hasflyout) {
											return (
												<div
													key={id}
													role="button"
													tabIndex={0}
													onClick={() => setthreadpanelopen(true)}
													onKeyDown={(e) => {
														if (e.key === "Enter" || e.key === " ") setthreadpanelopen(true)
													}}
													className="cursor-pointer"
													aria-label="Open threads"
												>
													<SidebarLink link={item} className={ischatactive ? "bg-accent/50 rounded-md px-1" : "px-1"}>
														<IconChevronRight className="size-3.5 text-muted-foreground" />
													</SidebarLink>
												</div>
											)
										}

										return <SidebarLink key={id} link={item} />
									})}
							</div>
						</div>

						{/* Footer: avatar + theme toggle + sign out */}
						<div className="flex flex-row items-center justify-between gap-2">
							<Link
								href="/settings/profile"
								className="flex flex-row items-center justify-start gap-2 group/sidebar py-2 rounded-md hover:bg-accent/50 transition-colors px-1 -mx-1 min-w-0"
							>
								<Avatar className="size-8 shrink-0 border border-neutral-600 dark:border-neutral-400">
									<AvatarImage src={image ?? ""} />
									<AvatarFallback>{name?.charAt(0)}</AvatarFallback>
								</Avatar>
								{isvisiblyexpanded && (
									<motion.p
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										className="text-neutral-700 dark:text-neutral-200 text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block p-0 m-0 truncate"
									>
										{name}
									</motion.p>
								)}
							</Link>

							{isvisiblyexpanded && (
								<div className="flex items-center gap-1 shrink-0">
									<ThemeSwitch />
									<TooltipProvider delayDuration={300}>
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={() => setsignoutopen(true)}
													className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
													aria-label="Sign out"
												>
													<IconLogout className="size-4" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="top">Sign out</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Sign-out confirmation */}
			<AlertDialog open={signoutopen} onOpenChange={setsignoutopen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Sign out?</AlertDialogTitle>
						<AlertDialogDescription>You will be redirected to the login page.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								window.location.href = "/api/auth/sign-out"
							}}
						>
							Sign out
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

const Sidebar = () => {
	const { collapsed } = useSidebarStore()
	const [threadpanelopen, setthreadpanelopen] = useState(false)

	const open = threadpanelopen ? true : !collapsed

	const setOpen = (val: boolean | ((prev: boolean) => boolean)) => {
		if (threadpanelopen) return
		const newval = typeof val === "function" ? val(!collapsed) : val
		useSidebarStore.getState().setcollapsed(!newval)
	}

	return (
		<RootSidebar open={open} setOpen={setOpen} animate={true}>
			<MobileSidebar>
				<SidebarContent collapsed={false} threadpanelopen={false} setthreadpanelopen={setthreadpanelopen} />
			</MobileSidebar>
			<SidebarBody
				className={cn(threadpanelopen ? "!p-0 justify-start gap-0" : "justify-between gap-10")}
				{...(threadpanelopen ? { animate: { width: "400px" } } : {})}
			>
				<SidebarContent
					collapsed={collapsed}
					threadpanelopen={threadpanelopen}
					setthreadpanelopen={setthreadpanelopen}
				/>
			</SidebarBody>
		</RootSidebar>
	)
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export const Logo = () => {
	return (
		<Link href="#" className="relative z-20 flex items-center py-1 text-sm font-normal">
			<motion.span
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				className="font-semibold whitespace-pre text-black dark:text-white"
			>
				OpenZosma
			</motion.span>
		</Link>
	)
}

export default Sidebar
