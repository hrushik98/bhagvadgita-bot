# Gita Guide

Ask life's questions and get answers grounded in the Bhagavad Gita, with every verse cited.

- **Ask**: a chat that retrieves the most relevant verses, streams an answer that cites them inline, and shows each verse on hover.
  It understands follow-up questions and replies in English, Hindi (Devanagari) or Hinglish.
- **Read**: all 18 chapters and 701 verses in Sanskrit, with transliteration, word meanings, five English and two Hindi translations.
- **Verse of the day** on the home page.
- **Care for people in distress**: messages that suggest a crisis get verified helpline numbers next to the answer.

Everything except the language model runs on your machine: the embedding model, the vector index and the database.
Only the final answer generation (and rewriting follow-up questions for search) calls DeepSeek.

## Quick start

Requirements: Node.js 24 or newer, and a [DeepSeek API key](https://platform.deepseek.com/api_keys).

```sh
npm install
cp apps/api/.env.example apps/api/.env   # then set DEEPSEEK_API_KEY
npm run setup                            # builds data/gita.db (first run downloads a 1.2 GB embedding model)
npm run dev                              # API on :4000, web on :3000
```

Open http://localhost:3000.

`npm run setup` is only needed once, and again after changing the source data, the enrichment, or the embedding model.

Values in `apps/api/.env` take precedence over variables exported in your shell, so a stale global `DEEPSEEK_API_KEY` cannot override the project's key.

## Run with Docker

```sh
./start.sh          # web on http://localhost:5501, API on http://localhost:5502
./start.sh --logs   # same, then follow the logs
docker compose down # stop
```

The script checks that Docker is running and that `apps/api/.env` has a `DEEPSEEK_API_KEY`, builds the images, and waits until both services are healthy.
`data/` and `.cache/` are mounted into the API container, so the index and the embedding model are shared with `npm run dev`.
If `data/gita.db` does not exist yet, the API builds it on first start (this downloads the 1.2 GB model once).
Running `./start.sh` again rebuilds and restarts the containers with your latest changes.

## How it works

```
apps/web  (Next.js 16)  ──HTTP/SSE──▶  apps/api  (Express 5)  ──▶  DeepSeek (answers only)
                                          │
                                          ├─ EmbeddingGemma 300M (ONNX, in-process via transformers.js)
                                          └─ data/gita.db (SQLite + FTS5 + sqlite-vec)
```

For each question the API:

1. Rewrites it into a standalone English question when it is a follow-up or not written in Latin script (one fast DeepSeek call with thinking disabled).
2. Searches three indexes with the original and the rewritten question: vectors of the translations, vectors of the verse enrichment, and BM25 keywords.
   Explicit references such as "2.47" are always included.
3. Fuses the rankings with reciprocal rank fusion and keeps the top six verses.
4. Streams an answer from DeepSeek grounded in those verses, as server-sent events: `notice`, `sources`, `thinking`, `delta`, `done`.

The verse enrichment (`data/enrichment/verses.json`) is the biggest quality lever.
It adds a plain-English summary, themes and everyday questions to each verse, which bridges modern phrasing and century-old translations.

### Retrieval quality

`npm run eval` scores retrieval on 30 hand-labelled questions in English, Hindi and Hinglish (`apps/api/scripts/eval-cases.json`).

| Setup | Hit rate @6 | MRR |
| --- | --- | --- |
| Hybrid search over translations only | 87% | 0.683 |
| + verse enrichment (current) | 93% | 0.917 |

Two things were tried and rejected because they scored worse: LLM query expansion with added themes (73%), and a local cross-encoder reranker (bge-reranker-v2-m3, 90% and 2.7 s per query).
Measure with `npm run eval` before changing retrieval.

## Project layout

| Path | What it is |
| --- | --- |
| `apps/api` | Express API: retrieval, chat orchestration, DeepSeek client, ingestion and eval scripts |
| `apps/web` | Next.js app: Ask and Read |
| `packages/shared` | Types shared by both apps |
| `data/source` | The vendored Gita dataset (see [data/README.md](data/README.md)) |
| `data/enrichment` | Committed LLM-generated search metadata |

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/chapters` | All chapters |
| `GET` | `/chapters/:chapter` | A chapter and its verses |
| `GET` | `/verses/:chapter/:verse` | A verse with all translations and its neighbours |
| `GET` | `/verse-of-the-day?date=YYYY-MM-DD` | A stable verse for the day (India time by default) |
| `GET` | `/search?q=...&limit=8` | Hybrid verse search |
| `POST` | `/chat` | `{ messages: [{ role, content }] }`, answered as a server-sent event stream |

## Configuration

API settings live in `apps/api/.env` (see `apps/api/.env.example`).
The most useful ones:

| Variable | Default | Notes |
| --- | --- | --- |
| `DEEPSEEK_MODEL` | `deepseek-flash` | `deepseek-v4-pro` for the larger model |
| `DEEPSEEK_REASONING_EFFORT` | `low` | `none` disables thinking for the fastest first token |
| `EMBEDDING_DTYPE` | `fp32` | `q8` or `q4` use less memory; run `npm run setup` after changing |
| `RETRIEVAL_TOP_K` | `6` | Verses given to the model per answer |
| `CHAT_RATE_LIMIT` | `20` | Chat requests per IP per minute |

The web app reads `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API and web in watch mode |
| `npm run build` / `npm start` | Production build and serve |
| `npm run setup` | Build `data/gita.db` |
| `npm run eval` | Retrieval eval (`-- --rewrite` to include the LLM rewrite, as in chat) |
| `npm run enrich -w api` | Regenerate verse enrichment (calls DeepSeek, about $0.01) |
| `npm run lint` / `npm run format` | Biome |
| `npm run typecheck` | TypeScript across workspaces |
| `npm test` | Vitest (hermetic: no model download or API key needed) |
