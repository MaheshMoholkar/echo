/** The narrow, centered column most dashboard pages use. */
export function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-6">{children}</div>
  )
}
