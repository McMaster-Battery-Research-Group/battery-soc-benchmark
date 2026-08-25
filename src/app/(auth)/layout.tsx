export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-grey-100/60">
      <div className="container-site flex min-h-[calc(100vh-4rem)] items-start justify-center py-12 md:items-center md:py-16">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
