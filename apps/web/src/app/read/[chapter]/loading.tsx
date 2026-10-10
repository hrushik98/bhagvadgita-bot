import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <Skeleton
      lines={[
        "h-12 w-1/2",
        "h-6 w-2/3",
        "h-4 w-full",
        "h-4 w-full",
        "h-4 w-3/4",
      ]}
    />
  );
}
