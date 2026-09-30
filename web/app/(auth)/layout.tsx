export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Echo</h1>
        <p className="text-sm text-muted-foreground">
          Local-only AI customer support
        </p>
      </div>
      {children}
    </main>
  )
}
