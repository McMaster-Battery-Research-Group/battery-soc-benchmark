import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="container-site py-8">
      <div className="card p-6 md:p-8">
        <div className="flex gap-5">
          <Skeleton className="size-28 shrink-0 rounded-brand" />
          <div className="flex-1">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="mt-3 h-4 w-96 max-w-full" />
            <Skeleton className="mt-2 h-4 w-72 max-w-full" />
          </div>
        </div>
      </div>
      <Skeleton className="mt-6 h-64 w-full" />
    </div>
  );
}
