"use client"

const ChatLayout = ({ children }: { children: React.ReactNode }) => {
	return <div className="h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-1rem)] -m-4 overflow-hidden">{children}</div>
}

export default ChatLayout
