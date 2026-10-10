import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <Skeleton lines={["h-14 w-28", "h-32 w-full", "h-6 w-full", "h-6 w-5/6"]} />
  );
}
