import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <Skeleton
      lines={[
        "h-10 w-2/3",
        "h-4 w-full",
        "h-4 w-4/5",
        "h-12 w-full",
        "h-12 w-full",
        "h-12 w-full",
      ]}
    />
  );
}
