import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="container-site py-10">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="card mt-6 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="mb-3 h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
