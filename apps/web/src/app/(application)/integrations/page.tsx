"use client"

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
import { Badge } from "@/src/components/ui/badge"
// COMPONENTS
import { Button } from "@/src/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/src/components/ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu"
import { Input } from "@/src/components/ui/input"
import { Label } from "@/src/components/ui/label"
import { Separator } from "@/src/components/ui/separator"
import { Switch } from "@/src/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip"
// UTILS
import { type SupportedDatabase, supporteddatabases } from "@/src/utils/supported-databases"
// ICONS
import {
	IconAlertTriangle,
	IconBolt,
	IconCheck,
	IconDatabase,
	IconDotsVertical,
	IconEraser,
	IconLoader2,
	IconPencil,
	IconPlug,
	IconPlugConnected,
	IconPlus,
	IconRefresh,
	IconTrash,
	IconX,
} from "@tabler/icons-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

type Integration = {
	id: string
	name: string
	type: string
	status: string
	workflowrunid: string | null
	workflowstatus: string
	createdat: string
}

type ConnectionTestState = {
	status: "idle" | "testing" | "success" | "failed"
	message: string
	latencyms?: number
}

// ─── Workflow Status Badge ──────────────────────────────────────────────────

function WorkflowStatusBadge({
	workflowstatus,
	onretry,
}: {
	workflowstatus: string
	onretry: (e: React.MouseEvent) => void
}) {
	if (!workflowstatus || workflowstatus === "idle") return null

	if (workflowstatus === "running") {
		return (
			<div className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-50 dark:bg-blue-950/20 px-2.5 py-1.5">
				<IconLoader2 className="size-3.5 text-blue-600 dark:text-blue-400 animate-spin" />
				<span className="text-xs font-medium text-blue-700 dark:text-blue-300">Setting up integration…</span>
			</div>
		)
	}

	if (workflowstatus === "completed") {
		return (
			<div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-50 dark:bg-green-950/20 px-2.5 py-1.5">
				<IconCheck className="size-3.5 text-green-600 dark:text-green-400" />
				<span className="text-xs font-medium text-green-700 dark:text-green-300">Setup complete</span>
			</div>
		)
	}

	if (workflowstatus === "failed") {
		return (
			<div className="flex items-center justify-between rounded-md border border-destructive/30 bg-red-50 dark:bg-red-950/20 px-2.5 py-1.5">
				<div className="flex items-center gap-2">
					<IconAlertTriangle className="size-3.5 text-red-600 dark:text-red-400" />
					<span className="text-xs font-medium text-red-700 dark:text-red-300">Setup failed</span>
				</div>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onretry}
								className="rounded p-0.5 hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
							>
								<IconBolt className="size-3.5 text-red-600 dark:text-red-400" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs">
							Retry setup
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
		)
	}

	return null
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const IntegrationsPage = () => {
	const [integrations, setIntegrations] = useState<Integration[]>([])
	const [loading, setLoading] = useState(true)
	const [showdialog, setShowdialog] = useState(false)
	const [selecteddb, setSelecteddb] = useState<SupportedDatabase | null>(null)
	const [step, setStep] = useState<"select" | "configure">("select")
	const [saving, setSaving] = useState(false)

	// Edit mode
	const [editingid, setEditingid] = useState<string | null>(null)
	const [loadingdetails, setLoadingdetails] = useState(false)

	// Delete confirmation
	const [showdeletedialog, setShowdeletedialog] = useState(false)
	const [deleting, setDeleting] = useState(false)

	// Form state
	const [integrationname, setIntegrationname] = useState("")
	const [host, setHost] = useState("")
	const [port, setPort] = useState("")
	const [database, setDatabase] = useState("")
	const [username, setUsername] = useState("")
	const [password, setPassword] = useState("")
	const [ssl, setSsl] = useState(false)

	// Connection test state
	const [teststate, setTeststate] = useState<ConnectionTestState>({
		status: "idle",
		message: "",
	})

	const fetchintegrations = useCallback(async () => {
		setLoading(true)
		try {
			const res = await fetch("/api/integrations")
			if (res.ok) {
				const data = await res.json()
				setIntegrations(data.integrations ?? [])
			}
		} catch {
			toast.error("Failed to load integrations")
		}
		setLoading(false)
	}, [])

	useEffect(() => {
		fetchintegrations()
	}, [fetchintegrations])

	// ─── Workflow polling ──────────────────────────────────────────────────────
	const pollingref = useRef<ReturnType<typeof setInterval> | null>(null)

	const startworkflowpolling = useCallback((integrationid: string) => {
		// Clear any existing polling
		if (pollingref.current) clearInterval(pollingref.current)

		pollingref.current = setInterval(async () => {
			try {
				const res = await fetch(`/api/integrations/${integrationid}/workflow`)
				if (!res.ok) return

				const data = await res.json()
				const status = data.workflowstatus

				// Update the integration in local state
				setIntegrations((prev) =>
					prev.map((i) =>
						i.id === integrationid ? { ...i, workflowstatus: status, workflowrunid: data.workflowrunid } : i,
					),
				)

				// Stop polling when workflow completes or fails
				if (status === "completed" || status === "failed" || status === "idle") {
					if (pollingref.current) {
						clearInterval(pollingref.current)
						pollingref.current = null
					}
					if (status === "completed") {
						toast.success("Integration setup completed")
					} else if (status === "failed") {
						toast.error("Integration setup failed")
					}
				}
			} catch {
				// Silently ignore polling errors
			}
		}, 3000)
	}, [])

	const triggerworkflow = useCallback(
		async (integrationid: string) => {
			try {
				const res = await fetch(`/api/integrations/${integrationid}/workflow`, { method: "POST" })
				if (res.ok) {
					const data = await res.json()
					// Update local state immediately
					setIntegrations((prev) =>
						prev.map((i) => (i.id === integrationid ? { ...i, workflowstatus: data.workflowstatus ?? "running" } : i)),
					)
					// Start polling
					startworkflowpolling(integrationid)
				} else {
					const data = await res.json()
					toast.error("Failed to start workflow", {
						description: data.error,
					})
				}
			} catch (error) {
				toast.error("Failed to start workflow", {
					description: (error as Error).message,
				})
			}
		},
		[startworkflowpolling],
	)

	// Start polling for any integrations that are already running on mount
	useEffect(() => {
		const running = integrations.find((i) => i.workflowstatus === "running")
		if (running) {
			startworkflowpolling(running.id)
		}
		return () => {
			if (pollingref.current) {
				clearInterval(pollingref.current)
				pollingref.current = null
			}
		}
	}, [integrations, startworkflowpolling])

	const resetform = () => {
		setStep("select")
		setSelecteddb(null)
		setEditingid(null)
		setIntegrationname("")
		setHost("")
		setPort("")
		setDatabase("")
		setUsername("")
		setPassword("")
		setSsl(false)
		setTeststate({ status: "idle", message: "" })
	}

	const handleopenadddialog = () => {
		resetform()
		setShowdialog(true)
	}

	const handleselectdb = (db: SupportedDatabase) => {
		setSelecteddb(db)
		setIntegrationname(`${db.name} Integration`)
		setPort(String(db.defaultport))
		setStep("configure")
	}

	const handleback = () => {
		// In edit mode, go back closes the dialog
		if (editingid) {
			setShowdialog(false)
			resetform()
			return
		}
		setStep("select")
		setSelecteddb(null)
		setIntegrationname("")
		setHost("")
		setPort("")
		setDatabase("")
		setUsername("")
		setPassword("")
		setSsl(false)
		setTeststate({ status: "idle", message: "" })
	}

	// ─── Edit: fetch integration details ──────────────────────────────────────
	const handleedit = async (integration: Integration) => {
		setLoadingdetails(true)
		setEditingid(integration.id)
		setShowdialog(true)
		setStep("configure")

		// Set the DB type info
		const dbinfo = supporteddatabases.find((db) => db.id === integration.type)
		setSelecteddb(dbinfo ?? null)

		try {
			const res = await fetch(`/api/integrations?id=${integration.id}`)
			if (!res.ok) {
				toast.error("Failed to load integration details")
				setShowdialog(false)
				resetform()
				return
			}

			const data = await res.json()
			const detail = data.integration

			setIntegrationname(detail.name)
			setHost(detail.config.host)
			setPort(String(detail.config.port))
			setDatabase(detail.config.database)
			setUsername(detail.config.username)
			setPassword(detail.config.password)
			setSsl(detail.config.ssl)
			setTeststate({ status: "idle", message: "" })
		} catch {
			toast.error("Failed to load integration details")
			setShowdialog(false)
			resetform()
		}

		setLoadingdetails(false)
	}

	const handletestconnection = async () => {
		if (!selecteddb || !host || !port || !database || !username) {
			toast.error("Please fill in all connection fields before testing.")
			return
		}

		setTeststate({ status: "testing", message: "Testing connection..." })

		try {
			const res = await fetch("/api/integrations/test-connection", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: selecteddb.id,
					host,
					port: Number(port),
					database,
					username,
					password,
					ssl,
				}),
			})

			const result = await res.json()

			if (result.success) {
				setTeststate({
					status: "success",
					message: result.message,
					latencyms: result.latencyms,
				})
			} else {
				setTeststate({
					status: "failed",
					message: result.message,
				})
			}
		} catch (error) {
			setTeststate({
				status: "failed",
				message: `Request failed: ${(error as Error).message}`,
			})
		}
	}

	// ─── Create ────────────────────────────────────────────────────────────────
	const handlecreate = async () => {
		if (!selecteddb || !integrationname.trim() || !host || !port || !database || !username) {
			toast.error("Please fill in all required fields.")
			return
		}

		if (teststate.status !== "success") {
			toast.error("Please test the connection successfully before saving.")
			return
		}

		setSaving(true)

		try {
			const res = await fetch("/api/integrations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: integrationname.trim(),
					type: selecteddb.id,
					host,
					port: Number(port),
					database,
					username,
					password,
					ssl,
				}),
			})

			if (res.ok) {
				const data = await res.json()
				toast.success("Integration created — starting setup workflow…")
				setShowdialog(false)
				resetform()
				await fetchintegrations()

				// Trigger setup workflow for the new integration
				if (data.integration?.id) {
					triggerworkflow(data.integration.id)
				}
			} else {
				const data = await res.json()
				toast.error("Failed to create integration", {
					description: data.error,
				})
			}
		} catch (error) {
			toast.error("Failed to create integration", {
				description: (error as Error).message,
			})
		}

		setSaving(false)
	}

	// ─── Update ────────────────────────────────────────────────────────────────
	const handleupdate = async () => {
		if (!editingid || !integrationname.trim() || !host || !port || !database || !username) {
			toast.error("Please fill in all required fields.")
			return
		}

		if (teststate.status !== "success") {
			toast.error("Please test the connection successfully before saving.")
			return
		}

		setSaving(true)

		try {
			const res = await fetch("/api/integrations", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: editingid,
					name: integrationname.trim(),
					type: selecteddb?.id,
					host,
					port: Number(port),
					database,
					username,
					password,
					ssl,
				}),
			})

			if (res.ok) {
				const data = await res.json()
				toast.success("Integration updated — restarting setup workflow…")
				setShowdialog(false)
				resetform()
				await fetchintegrations()

				// Re-trigger setup workflow after update
				if (data.integration?.id) {
					triggerworkflow(data.integration.id)
				}
			} else {
				const data = await res.json()
				toast.error("Failed to update integration", {
					description: data.error,
				})
			}
		} catch (error) {
			toast.error("Failed to update integration", {
				description: (error as Error).message,
			})
		}

		setSaving(false)
	}

	const handlesave = editingid ? handleupdate : handlecreate

	// ─── Delete ────────────────────────────────────────────────────────────────
	const handledelete = async () => {
		if (!editingid) return

		setDeleting(true)

		try {
			const res = await fetch(`/api/integrations?id=${editingid}`, {
				method: "DELETE",
			})

			if (res.ok) {
				toast.success("Integration deleted permanently")
				setShowdeletedialog(false)
				setShowdialog(false)
				resetform()
				fetchintegrations()
			} else {
				const data = await res.json()
				toast.error("Failed to delete integration", {
					description: data.error,
				})
			}
		} catch (error) {
			toast.error("Failed to delete integration", {
				description: (error as Error).message,
			})
		}

		setDeleting(false)
	}

	// ─── Re-index (trigger workflow) ────────────────────────────────────────
	const handlereindex = async (integrationid: string) => {
		toast.info("Re-indexing integration…")
		triggerworkflow(integrationid)
	}

	// ─── Delete context (clear embeddings) ────────────────────────────────────
	const [clearingcontextid, setClearingcontextid] = useState<string | null>(null)
	const [showclearcontextdialog, setShowclearcontextdialog] = useState(false)
	const [clearingcontext, setClearingcontext] = useState(false)

	const handleclearcontext = async () => {
		if (!clearingcontextid) return

		setClearingcontext(true)

		try {
			const res = await fetch(`/api/integrations/${clearingcontextid}/embeddings`, { method: "DELETE" })

			if (res.ok) {
				const data = await res.json()
				toast.success(`Cleared ${data.deleted.chunks} embedding${data.deleted.chunks === 1 ? "" : "s"}`)
			} else {
				const data = await res.json()
				toast.error("Failed to clear context", { description: data.error })
			}
		} catch (error) {
			toast.error("Failed to clear context", {
				description: (error as Error).message,
			})
		}

		setClearingcontext(false)
		setShowclearcontextdialog(false)
		setClearingcontextid(null)
	}

	const isformvalid = integrationname.trim() && host && port && database && username

	const isEditMode = !!editingid

	return (
		<div className="flex flex-col w-full h-full gap-6">
			{/* Header */}
			<div className="flex flex-row w-full justify-between items-center">
				<div>
					<h4 className="text-xl font-semibold">Integrations</h4>
					<p className="text-sm text-muted-foreground">Manage database connections for your instance</p>
				</div>
				<Button onClick={handleopenadddialog}>
					<IconPlus className="size-4" />
					Add Integration
				</Button>
			</div>

			{/* Integrations List */}
			{loading ? (
				<Card className="flex flex-col items-center justify-center py-16">
					<CardContent className="flex flex-col items-center gap-4">
						<IconLoader2 className="size-8 text-muted-foreground animate-spin" />
						<p className="text-sm text-muted-foreground">Loading integrations...</p>
					</CardContent>
				</Card>
			) : integrations.length === 0 ? (
				<Card className="flex flex-col items-center justify-center py-16">
					<CardContent className="flex flex-col items-center gap-4">
						<div className="rounded-full bg-muted p-4">
							<IconPlug className="size-8 text-muted-foreground" />
						</div>
						<div className="text-center">
							<h5 className="text-lg font-medium">No integrations yet</h5>
							<p className="text-sm text-muted-foreground mt-1">Add your first database integration to get started.</p>
						</div>
						<Button variant="outline" onClick={handleopenadddialog}>
							<IconPlus className="size-4" />
							Add Integration
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					{integrations.map((integration) => {
						const dbinfo = supporteddatabases.find((db) => db.id === integration.type)
						return (
							<Card
								key={integration.id}
								className="hover:border-primary/50 transition-colors cursor-pointer group"
								onClick={() => handleedit(integration)}
							>
								<CardHeader className="pb-3">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											{dbinfo ? (
												<dbinfo.Icon className="size-5 shrink-0" />
											) : (
												<span className="size-5 text-muted-foreground">DB</span>
											)}
											<CardTitle className="text-base">{integration.name}</CardTitle>
										</div>
										<div className="flex items-center gap-2">
											{/* Actions dropdown */}
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														onClick={(e) => e.stopPropagation()}
														className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
													>
														<IconDotsVertical className="size-4 text-muted-foreground" />
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
													<DropdownMenuItem onClick={() => handlereindex(integration.id)}>
														<IconRefresh className="size-4" />
														Re-index
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => {
															setClearingcontextid(integration.id)
															setShowclearcontextdialog(true)
														}}
														className="text-destructive focus:text-destructive"
													>
														<IconEraser className="size-4" />
														Delete Context
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
											<Badge variant={integration.status === "active" ? "default" : "secondary"}>
												{integration.status}
											</Badge>
										</div>
									</div>
									<CardDescription>{dbinfo?.name ?? integration.type}</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-2">
									{/* Workflow status indicator */}
									<WorkflowStatusBadge
										workflowstatus={integration.workflowstatus}
										onretry={(e) => {
											e.stopPropagation()
											triggerworkflow(integration.id)
										}}
									/>
									<p className="text-xs text-muted-foreground">
										Created {new Date(integration.createdat).toLocaleDateString()}
									</p>
								</CardContent>
							</Card>
						)
					})}
				</div>
			)}

			{/* Add / Edit Integration Dialog */}
			<Dialog
				open={showdialog}
				onOpenChange={(open) => {
					setShowdialog(open)
					if (!open) resetform()
				}}
			>
				<DialogContent className="sm:max-w-2xl">
					{step === "select" ? (
						<>
							<DialogHeader>
								<DialogTitle>Add Integration</DialogTitle>
								<DialogDescription>Select a database type to connect.</DialogDescription>
							</DialogHeader>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto py-2">
								{supporteddatabases.map((db) => (
									<button
										type="button"
										key={db.id}
										onClick={() => db.enabled && handleselectdb(db)}
										disabled={!db.enabled}
										className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
											db.enabled
												? "hover:bg-accent hover:border-primary/50 cursor-pointer"
												: "opacity-50 cursor-not-allowed"
										}`}
									>
										<db.Icon className="w-6 h-6 mt-0.5 shrink-0" />
										<div className="flex flex-col gap-0.5 flex-1">
											<div className="flex items-center justify-between">
												<span className="font-medium text-sm">{db.name}</span>
												{!db.enabled && (
													<Badge variant="outline" className="text-[10px] px-1.5 py-0">
														Coming Soon
													</Badge>
												)}
											</div>
											<span className="text-xs text-muted-foreground">{db.description}</span>
										</div>
									</button>
								))}
							</div>
						</>
					) : (
						<>
							<DialogHeader>
								<DialogTitle className="flex items-center gap-2">
									{selecteddb && <selecteddb.Icon className="size-5 shrink-0" />}
									{isEditMode ? "Edit" : "Configure"} {selecteddb?.name}
								</DialogTitle>
								<DialogDescription>
									{isEditMode
										? `Update connection details for your ${selecteddb?.name} integration. Re-test the connection before saving.`
										: `Provide connection details for your ${selecteddb?.name} integration. Connection will be tested before saving.`}
								</DialogDescription>
							</DialogHeader>

							{loadingdetails ? (
								<div className="flex flex-col items-center justify-center py-12">
									<IconLoader2 className="size-8 text-muted-foreground animate-spin" />
									<p className="text-sm text-muted-foreground mt-2">Loading connection details...</p>
								</div>
							) : (
								<>
									<div className="flex flex-col gap-4 py-2 max-h-[60vh] overflow-y-auto">
										<div className="flex flex-col gap-2">
											<Label htmlFor="integrationname">Integration Name</Label>
											<Input
												id="integrationname"
												value={integrationname}
												onChange={(e) => setIntegrationname(e.target.value)}
												placeholder="My Database"
											/>
										</div>
										<Separator />
										<div className="flex flex-col gap-2">
											<Label htmlFor="host">Host</Label>
											<Input
												id="host"
												value={host}
												onChange={(e) => {
													setHost(e.target.value)
													setTeststate({ status: "idle", message: "" })
												}}
												placeholder="localhost"
											/>
										</div>
										<div className="flex flex-row gap-4">
											<div className="flex flex-col gap-2 flex-1">
												<Label htmlFor="port">Port</Label>
												<Input
													id="port"
													value={port}
													onChange={(e) => {
														setPort(e.target.value)
														setTeststate({ status: "idle", message: "" })
													}}
													placeholder={String(selecteddb?.defaultport ?? "5432")}
												/>
											</div>
											<div className="flex flex-col gap-2 flex-1">
												<Label htmlFor="database">Database</Label>
												<Input
													id="database"
													value={database}
													onChange={(e) => {
														setDatabase(e.target.value)
														setTeststate({ status: "idle", message: "" })
													}}
													placeholder="mydb"
												/>
											</div>
										</div>
										<div className="flex flex-row gap-4">
											<div className="flex flex-col gap-2 flex-1">
												<Label htmlFor="username">Username</Label>
												<Input
													id="username"
													value={username}
													onChange={(e) => {
														setUsername(e.target.value)
														setTeststate({ status: "idle", message: "" })
													}}
													placeholder="admin"
												/>
											</div>
											<div className="flex flex-col gap-2 flex-1">
												<Label htmlFor="password">Password</Label>
												<Input
													id="password"
													type="password"
													value={password}
													onChange={(e) => {
														setPassword(e.target.value)
														setTeststate({ status: "idle", message: "" })
													}}
													placeholder="••••••"
												/>
											</div>
										</div>
										<div className="flex items-center gap-3">
											<Switch
												id="ssl"
												checked={ssl}
												onCheckedChange={(checked) => {
													setSsl(checked)
													setTeststate({ status: "idle", message: "" })
												}}
											/>
											<Label htmlFor="ssl" className="text-sm">
												Use SSL / TLS connection
											</Label>
										</div>

										{/* Connection Test Result */}
										{teststate.status !== "idle" && (
											<div
												className={`rounded-lg border p-3 text-sm ${
													teststate.status === "success"
														? "border-green-500/50 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400"
														: teststate.status === "failed"
															? "border-destructive/50 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
															: "border-muted bg-muted/30 text-muted-foreground"
												}`}
											>
												<div className="flex items-center gap-2">
													{teststate.status === "testing" && <IconLoader2 className="size-4 animate-spin" />}
													{teststate.status === "success" && <IconCheck className="size-4" />}
													{teststate.status === "failed" && <IconX className="size-4" />}
													<span>{teststate.message}</span>
												</div>
												{teststate.latencyms !== undefined && (
													<p className="mt-1 text-xs opacity-70">Latency: {teststate.latencyms}ms</p>
												)}
											</div>
										)}
									</div>
									<div className="flex justify-between pt-2">
										<div className="flex gap-2">
											<Button variant="outline" onClick={handleback}>
												{isEditMode ? "Cancel" : "Back"}
											</Button>
											{isEditMode && (
												<Button variant="destructive" onClick={() => setShowdeletedialog(true)}>
													<IconTrash className="size-4" />
													Delete
												</Button>
											)}
										</div>
										<div className="flex gap-2">
											{teststate.status === "success" ? (
												<>
													<Button variant="outline" onClick={handletestconnection} disabled={!isformvalid}>
														<IconPlugConnected className="size-4" />
														Re-test
													</Button>
													<Button onClick={handlesave} disabled={!isformvalid || saving}>
														{saving ? (
															<IconLoader2 className="size-4 animate-spin" />
														) : (
															<IconDatabase className="size-4" />
														)}
														{saving ? "Saving..." : isEditMode ? "Update Integration" : "Save Integration"}
													</Button>
												</>
											) : (
												<Button
													onClick={handletestconnection}
													disabled={!isformvalid || teststate.status === "testing"}
												>
													{teststate.status === "testing" ? (
														<IconLoader2 className="size-4 animate-spin" />
													) : (
														<IconPlugConnected className="size-4" />
													)}
													{teststate.status === "testing" ? "Testing..." : "Test Connection"}
												</Button>
											)}
										</div>
									</div>
								</>
							)}
						</>
					)}
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={showdeletedialog} onOpenChange={setShowdeletedialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Integration</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete <strong>{integrationname}</strong> and all its stored connection credentials.
							This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handledelete}
							disabled={deleting}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							{deleting ? <IconLoader2 className="size-4 animate-spin" /> : <IconTrash className="size-4" />}
							{deleting ? "Deleting..." : "Delete Permanently"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Clear Context Confirmation Dialog */}
			<AlertDialog
				open={showclearcontextdialog}
				onOpenChange={(open) => {
					setShowclearcontextdialog(open)
					if (!open) setClearingcontextid(null)
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Context</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove all stored embeddings and knowledge context for this integration. You can re-index later
							to regenerate them.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={clearingcontext}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleclearcontext}
							disabled={clearingcontext}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{clearingcontext ? <IconLoader2 className="size-4 animate-spin" /> : <IconEraser className="size-4" />}
							{clearingcontext ? "Clearing..." : "Delete Context"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

export default IntegrationsPage
