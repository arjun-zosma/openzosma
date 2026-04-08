"use client"
import { cn } from "@/src/lib/utils"
import { IconMenu2, IconX } from "@tabler/icons-react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type React from "react"
import { createContext, useContext, useEffect, useRef, useState } from "react"

type Links = {
	label: string
	href: string
	icon: React.JSX.Element | React.ReactNode
}

type SidebarContextProps = {
	open: boolean
	setOpen: React.Dispatch<React.SetStateAction<boolean>>
	animate: boolean
	hovered: boolean
	setHovered: React.Dispatch<React.SetStateAction<boolean>>
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined)

export const useSidebar = () => {
	const context = useContext(SidebarContext)
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider")
	}
	return context
}

export const SidebarProvider = ({
	children,
	open: openProp,
	setOpen: setOpenProp,
	animate = true,
}: {
	children: React.ReactNode
	open?: boolean
	setOpen?: React.Dispatch<React.SetStateAction<boolean>>
	animate?: boolean
}) => {
	const [openState, setOpenState] = useState(false)
	const [hovered, setHovered] = useState(false)

	const open = openProp !== undefined ? openProp : openState
	const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState

	return (
		<SidebarContext.Provider value={{ open, setOpen, animate, hovered, setHovered }}>
			{children}
		</SidebarContext.Provider>
	)
}

export const Sidebar = ({
	children,
	open,
	setOpen,
	animate,
}: {
	children: React.ReactNode
	open?: boolean
	setOpen?: React.Dispatch<React.SetStateAction<boolean>>
	animate?: boolean
}) => {
	return (
		<SidebarProvider open={open} setOpen={setOpen} animate={animate}>
			{children}
		</SidebarProvider>
	)
}

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
	return <DesktopSidebar {...props} />
}

export const DesktopSidebar = ({ className, children, ...props }: React.ComponentProps<typeof motion.div>) => {
	const { open, animate } = useSidebar()

	return (
		<motion.div
			className={cn(
				"h-full px-4 py-4 hidden md:flex md:flex-col bg-sidebar shrink-0 overflow-hidden relative",
				className,
			)}
			animate={{
				width: animate ? (open ? "300px" : "60px") : "300px",
			}}
			transition={{ duration: 0.2, ease: "easeOut" }}
			{...props}
		>
			{children}
		</motion.div>
	)
}

export const MobileSidebar = ({ className, children, ...props }: React.ComponentProps<"div">) => {
	const { open, setOpen } = useSidebar()
	const pathname = usePathname()
	const prevPathname = useRef(pathname)

	useEffect(() => {
		if (prevPathname.current !== pathname) {
			setOpen(false)
			prevPathname.current = pathname
		}
	}, [pathname, setOpen])

	return (
		<>
			<div
				className={cn(
					"h-10 px-4 py-4 flex flex-row md:hidden items-center justify-between bg-neutral-100 dark:bg-neutral-800 w-full",
				)}
				{...props}
			>
				<div className="flex justify-end z-20 w-full">
					<IconMenu2
						className="text-neutral-800 dark:text-neutral-200"
						onClick={() => setOpen(!open)}
						role="button"
						aria-label="Open menu"
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " " || e.keyCode === 13 || e.keyCode === 32) {
								e.preventDefault()
								setOpen(!open)
							}
						}}
					/>
				</div>
				<AnimatePresence>
					{open && (
						<motion.div
							initial={{ x: "-100%", opacity: 0 }}
							animate={{ x: 0, opacity: 1 }}
							exit={{ x: "-100%", opacity: 0 }}
							transition={{ duration: 0.3, ease: "easeInOut" }}
							className={cn(
								"fixed h-full w-full inset-0 bg-white dark:bg-neutral-900 p-10 z-[100] flex flex-col justify-between",
								className,
							)}
						>
							<div
								role="button"
								className="absolute right-10 top-10 z-50 text-neutral-800 dark:text-neutral-200"
								onClick={() => setOpen(!open)}
								aria-label="Close menu"
								tabIndex={0}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault()
										setOpen(!open)
									}
								}}
							>
								<IconX />
							</div>
							{children}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</>
	)
}

export const SidebarLink = ({
	link,
	className,
	children,
	...props
}: {
	link: Links
	className?: string
	children?: React.ReactNode
}) => {
	const { open, animate } = useSidebar()

	return (
		<div className="relative">
			<Link
				href={link.href}
				className={cn("flex items-center justify-start gap-2 group/sidebar py-2", className)}
				{...props}
			>
				{link.icon}

				<motion.span
					animate={{
						opacity: animate ? (open ? 1 : 0) : 1,
					}}
					style={{
						pointerEvents: animate ? (open ? "auto" : "none") : "auto",
						visibility: animate ? (open ? "visible" : "hidden") : "visible",
					}}
					className="text-neutral-700 dark:text-neutral-200 text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block !p-0 !m-0 flex-1"
				>
					{link.label}
				</motion.span>

				{children && (
					<motion.span
						animate={{
							opacity: animate ? (open ? 1 : 0) : 1,
						}}
						style={{
							pointerEvents: animate ? (open ? "auto" : "none") : "auto",
							visibility: animate ? (open ? "visible" : "hidden") : "visible",
						}}
					>
						{children}
					</motion.span>
				)}
			</Link>
		</div>
	)
}
