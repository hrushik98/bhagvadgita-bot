# Data

## `source/`

The Bhagavad Gita text, vendored from [gita/gita](https://github.com/gita/gita) at commit `c6fce39595445768876ddbb8d1268a9c935e1d2b`.
The repository is released under the Unlicense.
It contains 701 verses (chapter 13 includes the optional opening verse), the Sanskrit text, transliteration, word meanings, and translations by several authors.

The repository's license covers the compilation, not necessarily every translation in it.
Before publishing this app publicly, confirm that the texts you display may be used that way.
Swami Sivananda, whose translation is the primary English text, died in 1963, so his works entered the public domain in India in 2024 (life plus 60 years); other countries differ.
The transliterations and word-by-word meanings appear to come from a modern copyrighted edition and deserve a closer look.

## `enrichment/verses.json`

LLM-generated search metadata for every verse: a plain-English summary, themes, and questions people ask today that the verse helps answer.
It is indexed alongside the translations so that modern phrasing ("how do I stop worrying about results at work?") finds the right verse.
It is used only for search and is never shown to readers.
Regenerate it with `npm run enrich -w api -- --force` after changing the prompt in `apps/api/scripts/enrich.ts`.

## `gita.db` (generated, not committed)

SQLite database built by `npm run setup`: chapters, verses, translations, an FTS5 keyword index and two sqlite-vec vector indexes.
