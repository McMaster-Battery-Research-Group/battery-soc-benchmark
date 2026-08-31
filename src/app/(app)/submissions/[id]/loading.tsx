import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="container-site py-8">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-9 w-80 max-w-full" />
      <Skeleton className="mt-3 h-5 w-64 max-w-full" />
      <Skeleton className="mt-6 h-64 w-full" />
      <Skeleton className="mt-6 h-96 w-full" />
    </div>
  );
}
