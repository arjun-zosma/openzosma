"use client"

import { Button } from "@/src/components/ui/button"
import { Switch } from "@/src/components/ui/switch"
import type { ModelPreset } from "@/src/types/models"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"

export const modelsColumns: ColumnDef<ModelPreset>[] = [
	{
		accessorKey: "display_name",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					className="h-auto p-0 font-semibold hover:bg-transparent px-0! hover:cursor-pointer"
				>
					Name
					<ArrowUpDown className="ml-2 size-4" />
				</Button>
			)
		},
		cell: ({ row }) => {
			return <div className="text-sm font-medium">{row.original.display_name}</div>
		},
	},
	{
		accessorKey: "description",
		header: "Description",
		cell: ({ row }) => {
			return <div className="text-sm">{row.original.description}</div>
		},
	},
	{
		accessorKey: "note",
		header: "Note",
		cell: ({ row }) => {
			return <div className="text-sm">{row.original.note}</div>
		},
	},
	{
		accessorKey: "provider",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					className="h-auto p-0 font-semibold hover:bg-transparent px-0! hover:cursor-pointer"
				>
					Provider
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			)
		},
		cell: ({ row }) => {
			return <div className="text-sm capitalize">{row.original.provider}</div>
		},
	},
	{
		accessorKey: "provider_model",
		header: "Provider Model",
		cell: ({ row }) => {
			return <div className="text-sm">{row.original.provider_model}</div>
		},
	},
	{
		accessorKey: "is_enabled",
		header: "Enabled",
		cell: ({ row }) => {
			return (
				<Switch
					checked={row.original.is_enabled}
					onCheckedChange={() => {
						// TODO: implement is_enabled toggle
					}}
				/>
			)
		},
	},
	{
		accessorKey: "is_default",
		header: "Default",
		cell: ({ row }) => {
			return <div className="text-sm">{row.original.is_default ? "Yes" : "No"}</div>
		},
	},
	{
		accessorKey: "sort_order",
		header: "Sort Order",
		cell: ({ row }) => {
			return <div className="text-sm">{row.original.sort_order}</div>
		},
	},
	{
		accessorKey: "show_in_ui",
		header: "Show in UI",
		cell: ({ row }) => {
			return (
				<Switch
					checked={row.original.show_in_ui}
					onCheckedChange={() => {
						// TODO: implement show_in_ui toggle
					}}
				/>
			)
		},
	},
	{
		accessorKey: "created_at",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					className="h-auto p-0 font-semibold hover:bg-transparent px-0! hover:cursor-pointer"
				>
					Created At
					<ArrowUpDown className="ml-2 size-4 pl-0" />
				</Button>
			)
		},
		cell: ({ row }) => {
			const dateValue = row.getValue("created_at")
			const date = dateValue instanceof Date ? dateValue : new Date(dateValue as string)
			return (
				<div className="text-sm text-muted-foreground">
					{date.toLocaleDateString("en-US", {
						year: "numeric",
						month: "short",
						day: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					})}
				</div>
			)
		},
	},
	{
		accessorKey: "updated_at",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					className="h-auto p-0 font-semibold hover:bg-transparent px-0! hover:cursor-pointer"
				>
					Updated At
					<ArrowUpDown className="ml-2 size-4 pl-0" />
				</Button>
			)
		},
		cell: ({ row }) => {
			const dateValue = row.getValue("updated_at")
			const date = dateValue instanceof Date ? dateValue : new Date(dateValue as string)
			return (
				<div className="text-sm text-muted-foreground">
					{date.toLocaleDateString("en-US", {
						year: "numeric",
						month: "short",
						day: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					})}
				</div>
			)
		},
	},
]
