import { AnimatedComponents } from "@/src/components/molecules/animated-nodes"
// COMPONENTS
import { AnimatedText } from "@/src/components/molecules/animated-text"
import { Button } from "@/src/components/ui/button"
// ICONS
import { Asterisk, Globe, Rss, ShieldCheck } from "lucide-react"
// NEXT
import Link from "next/link"

const HeroPage = () => {
	return (
		<AnimatedComponents duration={1} direction="bottom">
			<div className="flex flex-col items-center justify-center gap-4">
				<div className="flex flex-wrap items-center justify-center gap-6">
					<div className="text-primary/40 flex items-center justify-center gap-2 text-xs font-medium tracking-tight md:text-lg">
						<Rss className="size-4" />
						<span>Real Time Knowledge</span>
					</div>
					<div className="text-primary/40 flex items-center justify-center gap-2 text-xs font-medium tracking-tight md:text-lg">
						<ShieldCheck className="size-4" />
						<span>Secure and Private</span>
					</div>
					<div className="text-primary/40 flex items-center justify-center gap-2 text-xs font-medium tracking-tight md:text-lg">
						<Globe className="size-4 animate-spin" />
						<span>Works Everywhere</span>
					</div>
				</div>
				<div className="flex flex-row items-center md:items-start justify-center">
					<h1 className="text-center text-foreground font-antonio text-4xl font-extrabold uppercase tracking-tight md:text-8xl">
						<AnimatedText text="Improving Business Intelligence" />
					</h1>
					<Asterisk size={40} strokeWidth={3} className="hidden md:block lg:block text-red-500 size-fit" />
				</div>
				<p className="text-muted-foreground/80 max-w-xl">
					An AI agent that analyzes business data, extracts key insights, and provides real-time business intelligence,
					helping businesses make data-driven decisions.
				</p>
				<div className="bg-muted-foreground/10 flex rounded-3xl p-1.5">
					<Button className="rounded-3xl" size={"lg"} asChild>
						<Link href="/features">See Features</Link>
					</Button>
					<Button className="rounded-3xl" variant={"ghost"} size={"lg"} asChild>
						<Link href="/login">Try the Demo</Link>
					</Button>
				</div>
			</div>
		</AnimatedComponents>
	)
}

export default HeroPage
