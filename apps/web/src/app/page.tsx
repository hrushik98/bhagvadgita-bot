import { Suspense } from "react";
import { Chat } from "@/components/chat/chat";
import {
  VerseOfTheDay,
  VerseOfTheDaySkeleton,
} from "@/components/verse-of-the-day";

export default function HomePage() {
  return (
    <Chat
      welcome={
        <Suspense fallback={<VerseOfTheDaySkeleton />}>
          <VerseOfTheDay />
        </Suspense>
      }
    />
  );
}
