"use client"

// COMPONENTS
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
import { Button } from "@/src/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
// AUTH
import { useSession } from "@/src/lib/auth-client"
// ICONS
import { IconAlertTriangle, IconBox, IconLoader2, IconRefresh, IconSettings, IconTrash } from "@tabler/icons-react"
import { useCallback, useEffect, useState } from "react"
// TOAST
import { toast } from "sonner"

interface SandboxInfo {
	sandboxName: string
	status: string
	createdAt: string
	lastActiveAt: string
}

/**
 * Extract an error message string from a gateway error response.
 * The gateway returns either `{ error: "string" }` or
 * `{ error: { code: "...", message: "..." } }`.
 */
const extractErrorMessage = (error: unknown): string => {
	if (typeof error === "string") return error
	if (error && typeof error === "object" && "message" in error) {
		return (error as { message: string }).message
	}
	return "An unknown error occurred"
}

const SettingsPage = () => {
	const { data: session, isPending } = useSession()
	const user = session?.user

	const [sandbox, setSandbox] = useState<SandboxInfo | null>(null)
	const [loadingSandbox, setLoadingSandbox] = useState(true)
	const [showDestroyDialog, setShowDestroyDialog] = useState(false)
	const [destroying, setDestroying] = useState(false)
	const [confirmName, setConfirmName] = useState("")

	const fetchSandboxInfo = useCallback(async () => {
		setLoadingSandbox(true)
		try {
			const response = await fetch("/api/sandbox")
			if (response.ok) {
				const data = await response.json()
				setSandbox(data.sandbox ?? null)
			}
		} catch {
			// Sandbox info is best-effort
		} finally {
			setLoadingSandbox(false)
		}
	}, [])

	useEffect(() => {
		if (!isPending) {
			void fetchSandboxInfo()
		}
	}, [isPending, fetchSandboxInfo])

	const handleDestroySandbox = async () => {
		setDestroying(true)
		try {
			const response = await fetch("/api/sandbox", { method: "DELETE" })
			const data = await response.json()

			if (response.ok && data.ok) {
				toast.success("Sandbox destroyed. A fresh sandbox will be created on your next message.")
				setShowDestroyDialog(false)
				setConfirmName("")
				setSandbox(null)
			} else {
				toast.error(extractErrorMessage(data.error))
			}
		} catch {
			toast.error("Failed to destroy sandbox. Check the console for details.")
		} finally {
			setDestroying(false)
		}
	}

	if (isPending) {
		return (
			<div className="flex flex-col w-full h-full gap-6">
				<p className="text-sm text-muted-foreground">Loading...</p>
			</div>
		)
	}

	const canDestroy = sandbox && confirmName === sandbox.sandboxName

	return (
		<div className="flex flex-col w-full h-full gap-6">
			{/* General Settings */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base flex items-center gap-2">
						<IconSettings className="size-4" />
						General
					</CardTitle>
					<CardDescription>Instance information for your OpenZosma deployment.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label>Instance Name</Label>
						<Input value="OpenZosma" disabled />
						<p className="text-xs text-muted-foreground">Self-hosted OpenZosma instance.</p>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Signed In As</Label>
						<Input value={user?.email ?? ""} disabled />
					</div>
				</CardContent>
			</Card>

			{/* Sandbox Info */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="text-base flex items-center gap-2">
								<IconBox className="size-4" />
								Sandbox
							</CardTitle>
							<CardDescription>Your agent sandbox environment.</CardDescription>
						</div>
						<Button variant="ghost" size="icon" onClick={fetchSandboxInfo} disabled={loadingSandbox}>
							<IconRefresh className={`size-4 ${loadingSandbox ? "animate-spin" : ""}`} />
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{loadingSandbox ? (
						<p className="text-sm text-muted-foreground">Loading sandbox info...</p>
					) : sandbox ? (
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1">
								<Label className="text-xs text-muted-foreground">Name</Label>
								<p className="text-sm font-mono">{sandbox.sandboxName}</p>
							</div>
							<div className="flex flex-col gap-1">
								<Label className="text-xs text-muted-foreground">Status</Label>
								<p className="text-sm">
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
											sandbox.status === "ready"
												? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
												: sandbox.status === "error"
													? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
													: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
										}`}
									>
										{sandbox.status}
									</span>
								</p>
							</div>
							<div className="flex flex-col gap-1">
								<Label className="text-xs text-muted-foreground">Created</Label>
								<p className="text-sm">{new Date(sandbox.createdAt).toLocaleString()}</p>
							</div>
							<div className="flex flex-col gap-1">
								<Label className="text-xs text-muted-foreground">Last Active</Label>
								<p className="text-sm">{new Date(sandbox.lastActiveAt).toLocaleString()}</p>
							</div>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">No sandbox found. One will be created on your next message.</p>
					)}
				</CardContent>
			</Card>

			{/* Danger Zone */}
			{sandbox && (
				<Card className="border-destructive/50">
					<CardHeader>
						<CardTitle className="text-base flex items-center gap-2 text-destructive">
							<IconAlertTriangle className="size-4" />
							Danger Zone
						</CardTitle>
						<CardDescription>Irreversible actions that affect your sandbox environment.</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-center justify-between rounded-md border border-destructive/30 p-4">
							<div className="flex flex-col gap-1">
								<p className="text-sm font-medium">Destroy Sandbox</p>
								<p className="text-xs text-muted-foreground">
									Tear down your agent sandbox. A fresh sandbox with the latest knowledge base will be created on your
									next message.
								</p>
							</div>
							<Button variant="destructive" onClick={() => setShowDestroyDialog(true)}>
								<IconTrash className="size-4" />
								Destroy
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Destroy Confirmation Dialog */}
			<AlertDialog
				open={showDestroyDialog}
				onOpenChange={(open) => {
					setShowDestroyDialog(open)
					if (!open) setConfirmName("")
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Destroy Sandbox</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="flex flex-col gap-3">
								<p>
									This will destroy your current agent sandbox, terminating all active sessions. A new sandbox will be
									provisioned automatically on your next message with the latest knowledge base content.
								</p>
								<p>
									To confirm, type the sandbox name{" "}
									<strong className="font-mono text-foreground select-all">{sandbox?.sandboxName}</strong> below:
								</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Input
						placeholder={sandbox?.sandboxName}
						value={confirmName}
						onChange={(e) => setConfirmName(e.target.value)}
						className="font-mono"
						autoFocus
					/>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={destroying}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDestroySandbox}
							disabled={destroying || !canDestroy}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{destroying ? <IconLoader2 className="size-4 animate-spin" /> : <IconTrash className="size-4" />}
							{destroying ? "Destroying..." : "Destroy Sandbox"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

export default SettingsPage
