# Echo

AI customer support you can embed on any site: a chat and voice widget answered
by an AI agent that searches the business's knowledge base and hands off to a
human operator. A local-only rewrite of a Next.js + Convex + Clerk + Vapi +
OpenAI template (kept in `ref/`, gitignored): everything runs on the Mac mini.

| Part | What | Replaces |
|---|---|---|
| `web/` | Next.js 16 + shadcn/ui: dashboard and `/widget` route | two Next.js apps |
| `api/` | FastAPI (Python 3.13, uv), PydanticAI agents | Convex |
| Postgres + pgvector | from the homelab (`lab.yml`) | Convex DB + vector search |
| Ollama (native) | `qwen3.5:4b` chat/tools, `nomic-embed-text` embeddings | OpenAI |
| Better Auth | login + organizations in Next.js, JWT verified by FastAPI | Clerk |
| `voice/` | Pipecat: MLX Whisper, Kokoro, Silero VAD, Smart Turn v3 | Vapi |

## Run it

Needs the homelab on the mini (`lab`, Ollama with both models, uv, pnpm).

```bash
make setup   # lab up (.env.lab), uv sync, pnpm install, auth + app tables
make dev     # web on :3000, api on :8000, voice bot on :8001
make migrate # after pulling new Alembic migrations
```

`make setup` expects a root `.env` (gitignored) with local secrets:
`BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and
`BETTER_AUTH_URL=http://localhost:3000`.

From the laptop: `ssh -L 3000:localhost:3000 mini`, then open
http://localhost:3000 (localhost keeps the microphone allowed for voice later).
The browser only talks to Next.js; `/api/v1/*` is proxied to FastAPI.

```bash
make test    # API tests against lab Postgres (rolled back); LLM and embeddings faked
make check   # ruff, formatting, ESLint, TypeScript
make smoke   # PydanticAI -> Ollama tool call, prints every message
make eval ORG=<org id> RUNS=2   # grounding eval with the real model (see below)
```

The widget for an organization is at `/widget?organizationId=<org id>`; the
dashboard's "Your widget" card links to it and shows the iframe snippet.

## How chat works

1. **Contact sessions** (`api/src/echo_api/contacts.py`): widget visitors
   have no account. Name + email → a session id (random UUID, 24 h, extended
   while in use), sent as `X-Contact-Session`. Every route checks it, and a
   visitor only ever sees their own conversations (others' read as 404).
2. **Streaming** (`routers/public.py`): `POST …/conversations/{id}/messages`
   answers with Server-Sent Events: `message` (saved), `tool`, `delta`
   (reply tokens as generated), `error`, `status`. The widget reads them from
   `fetch` (`web/lib/widget-api.ts`); `EventSource` can't POST or send headers.
3. **The agent** (`agent.py`): a PydanticAI agent on Ollama with two tools,
   `escalate_conversation` (only when the customer asks for a person or
   accepts the offer) and `resolve_conversation`, which change the
   conversation's status. Escalated: the AI stays quiet and the widget polls
   for a human's reply. Resolved: no new messages (409).
4. **Prompt layout for Ollama's cache**: instructions and tools first and
   never changing, then the history rebuilt identically each turn, then the
   new message with its search results. Only the end is new, so turns after
   the first skip most of the prefill. Answers with search results take
   ~3–6 s on the mini; small talk ~1–2 s.
5. **Gotcha**: Next.js gzips proxied responses, and gzip buffers a stream
   until it has enough bytes, so replies arrived in one lump. The SSE route
   sends `Cache-Control: no-transform`, set in a dependency because a
   streaming function's body runs after the headers are sent. A test guards it.

## How the knowledge base works

1. **Upload** (dashboard → Knowledge base, `routers/files.py`): PDF, Word,
   Markdown, text or HTML up to 10 MB. The same bytes twice are refused (409);
   the same *name* again replaces the old version once the new one is ready.
2. **Ingest** (`ingest.py`, in the background): `markitdown` → Markdown;
   `chunking.chunk_markdown` → one or more chunks per section (~1,000
   characters, 150 overlap), each starting with its heading trail
   ("Help Center > Returns"); `nomic-embed-text` → 768 numbers per chunk
   (with its `search_document:` / `search_query:` prefixes); stored in
   `chunks.embedding` with an HNSW index. Only the extracted text is kept.
3. **Search** (`knowledge.py`): the question is embedded, the nearest chunks
   *of this organization* come back (pgvector iterative scan keeps the tenant
   filter exact), and anything further than cosine distance 0.45 is dropped.
4. **Answer** (`agent.py`): every customer message is searched *before* the
   model runs, and the results go at the end of the prompt, after the
   message, in `<knowledge_base>` with a reminder to answer only from them.

What we measured on the way (`docs/sample-knowledge-base/`, `make eval`):

- **Chunk by section.** Size-only chunking packed a 5-section help center
  into 2 mixed chunks; "customs?" matched the returns chunk, and answerable
  vs unanswerable questions overlapped in distance (0.29–0.44 vs 0.42–0.51).
  One chunk per section: answerable 0.26–0.34.
- **Distance can't judge relevance alone.** Answerable questions still reach
  0.44 and unanswerable ones start at 0.41, so 0.45 is a noise floor and the
  model makes the final call.
- **Don't let a 4B model decide whether to search.** With a search *tool*,
  it skipped searching for "Do you have a mobile app?" and invented "Yes,
  iOS and Android". Searching every message (pipeline RAG) fixes that and is
  one model call per turn instead of two.
- **Repeat the rule next to the results.** Eval, 2 runs × 12 questions:
  instructions only → answerable 11/12, invented 5/12; with the note after
  every result block → 12/12, invented 2–3/12 flagged, of which about one is
  a real invention (the rest are honest answers the rough rules flag).
  Temperature 0.2 made no measurable difference.
- **What's left:** partial context. "Student discount?" retrieves the
  pricing section, which doesn't mention one, and the model sometimes fills
  the gap. Next levers: a bigger model, hybrid (keyword + vector) search, a
  relevance check, and an eval judged by a stronger model.

## How the operator inbox works

1. **Inbox** (dashboard → Conversations, `routers/inbox.py`): an
   organization's conversations, newest activity first, filterable by
   status, with the visitor's name, email and browser details. Pages use a
   **keyset cursor**, `(updated_at, id)` of the last row: the next page is
   "everything older", so it stays fast deep into the list and rows don't
   repeat or vanish while new messages reorder the top.
2. **Takeover**: an operator's reply on a conversation the AI is handling
   makes it `escalated`, and the AI stops answering. "Hand back to AI" sets
   it to `unresolved` again; "Resolve" closes it (no new messages from either
   side, 409).
3. **Enhance** (`assist.py`): a second, separate agent rewrites the
   operator's draft clearly and politely. The prompt alone let "499" become
   "$499" in half the samples, so an **output validator** rejects rewrites
   that add a currency symbol or a number, and PydanticAI sends the reason
   back to the model for another try (0 of 8 after the fix). It can't catch
   changes of meaning ("50+" became "over 50" once): the operator reviews
   the text before sending.
4. **Updates are polled**: the inbox list every 5 s, an open thread every
   3 s, the widget every 4 s while a chat is open. The widget has to poll
   even when it thinks the AI is answering: a takeover happens on the
   server, and the end-to-end test caught the widget missing the operator's
   reply. The next step up is pushing changes instead (Postgres
   LISTEN/NOTIFY → SSE), worth it once polling load matters.
5. `now()` in Postgres is the start of the *transaction*, so rows written in
   one transaction shared a timestamp and sorted arbitrarily; timestamps use
   `clock_timestamp()` instead.

## How OCR works

Scanned PDFs and images (PNG, JPG, WebP) are read with **GLM-OCR**
(`glm-ocr:q8_0`, 0.9B, 1.6 GB) on Ollama (`api/src/echo_api/ocr.py`).

- A PDF is read as text first; under 40 characters per page means a scan,
  so its pages are rendered (pypdfium2) and sent to OCR, up to 25 pages.
- Blank margins are cropped first: an uncropped, mostly empty page came back
  out of order (the title last).
- GLM-OCR doesn't stop: it reads the page, then starts over until it runs
  out of tokens (50 s for one page). The output is streamed, and as soon as
  two consecutive paragraphs repeat, the first pass is kept and the request
  is dropped, which stops Ollama. One page: ~1-3 s.
- The model stays loaded 30 s after a document (`keep_alive`), then unloads.
  With the lab's limit of two loaded models, a chat right after an upload
  can wait while models swap (8 s once, then 4 s).
- `docs/sample-knowledge-base/acme-holiday-notice-scan.pdf` is an image-only
  PDF for trying it; tests fake the OCR model.

## How voice works

The widget's "Talk to us" starts a call with the local bot in `voice/`
(Pipecat 1.12). Only the WebRTC setup goes through Next.js (`/api/voice/offer`,
contact session checked like the chat); audio flows browser ⇄ bot directly.

    mic → WebRTC → Silero VAD + Smart Turn v3 → MLX Whisper (large-v3-turbo q4)
        → knowledge search (same pipeline RAG as the chat) → Ollama qwen3.5:4b
        → Kokoro (int8, CPU) → WebRTC → speaker

- Each call saves its transcript to the conversation, so the team sees voice
  calls in the inbox; "Continue in chat" carries on in the same thread.
- Barge-in works: talking over the bot stops it and it answers the new
  question. A conversation the team has taken over refuses calls (409).
- `make voice-models` fetches Kokoro int8 (92 MB) and Whisper (~460 MB);
  the server loads Whisper at startup (first transcription 3.7 s → 0.86 s).

### Where a voice reply's wait goes

`make voice-latency ORG=<id> [COLD=1]` (with `make dev` running) makes a
scripted call: a Python WebRTC client speaks questions (Kokoro, another
voice), cuts in on the last answer, and times each wait from the moment it
stops talking to the first reply audio. It gets the bot's own events over
the RTVI data channel, as the widget does, so every wait is broken down:

    WAIT  3.48 s = turn end 0.94 + search 0.03 + first token 1.54
                   + chunk written 0.06 + Kokoro + audio 0.91

- **Turn end ~1 s**: VAD waits 0.2 s of silence, then Smart Turn v3 judges
  the turn complete and Whisper transcribes it (~0.85 s).
- **First token ~1.5 s**: the model reads the ~700-token prompt. The
  instructions and history are cached by Ollama; the ~450 new tokens are
  mostly the knowledge-base passages.
- **Kokoro**: turns a whole piece of text into audio before playing any of
  it, ~0.4 s + ~0.35 s per second of speech on the CPU. So the reply is cut
  into short pieces at the start (`echo_voice.timing`): at commas until
  ~40 characters are queued, whole sentences after that.

What changed the numbers (all waits after the caller stops):

| | before | after |
|---|---|---|
| First question, model unloaded | 12.2 s | 3.4 s |
| Later questions | 4.5-7.2 s | 3.5-3.7 s |
| A question spoken in two parts while the bot talks | 9.0 s | 3.5 s |

- **Warm-up during the greeting** (`warm_up_call`): loads the chat and
  embedding models if Ollama unloaded them, and has the model read the
  instructions + history, so the first question costs only its own tokens.
- **Every part of a turn is transcribed before it ends**
  (`SmartTurnWithAllTranscripts`): "Sorry, one more thing. When is…" is two
  stretches of speech. The first one's transcript arrived after the caller
  had started the second, and Pipecat ended the turn without the second:
  the model answered "sorry one more thing", then got interrupted.
- **Short first pieces** (`ShortOpeningAggregator`), above.

Left: replies told to "open with a few words" start sooner ("Sure." at
~3.5 s instead of a full sentence at ~5 s), but a long sentence with no
comma after it leaves a 1-2 s pause while Kokoro works. A faster TTS (Kokoro
on the GPU, e.g. via MLX) would remove that. A sentence cut off by barge-in
isn't saved: the transcript has the sentences that were fully spoken.

## How auth works

1. **Better Auth** (`web/lib/auth.ts`) runs inside Next.js: sign-up/in,
   the session cookie, organizations. Its tables live in the `auth` schema
   (`make auth-migrate`); app tables live in `public` (Alembic, `make migrate`).
2. For API calls the browser gets a **15-minute JWT** from
   `/api/auth/token` (`web/lib/api.ts`), signed with an Ed25519 key. Claims:
   `sub` (user), `orgId` (active organization), `aud=echo-api`, `iss`, `exp`.
3. **FastAPI** (`api/src/echo_api/auth.py`) verifies it with the public keys
   from `/api/auth/jwks`, cached: signature (algorithm pinned to EdDSA),
   issuer, audience, expiry. `OrgUser` routes also require an `orgId`, and
   every tenant query filters by it. `api/tests/test_auth.py` has one test
   per way a bad token could get through.
4. `web/proxy.ts` only checks that a session cookie exists (fast redirect);
   the dashboard layout validates the session and active org on the server.

Switching organization changes the `orgId` claim, so the cached API token is
dropped (`clearApiToken`). Revocation is bounded by the 15-minute expiry: a
removed member keeps API access until their token runs out.

## Version notes

- Python 3.13, not 3.14: `kokoro-onnx` (voice TTS) doesn't support 3.14 yet.
- TypeScript 6.0 and ESLint 9, not 7 and 10: typescript-eslint and
  eslint-plugin-react don't support them yet. TS 7 itself builds this app.
- Thinking off for qwen3.5: PydanticAI's `thinking=False` is ignored by
  Ollama; `openai_reasoning_effort="none"` works (1.8 s vs 5.8 s per reply).

## Milestones

1. ✅ Scaffold: web + api + lab Postgres + Ollama, health check end to end
2. ✅ Auth and organizations: Better Auth, JWT → FastAPI via JWKS
3. ✅ Text chat: widget sessions, SSE streaming, agent tools (escalate, resolve)
4. ✅ Knowledge base: upload → parse → chunk → embed → pgvector search → grounded answers
5. ✅ Operator inbox: filters, cursor pages, replies, takeover and hand-back, Enhance
4b. ✅ OCR for scanned PDFs and images (GLM-OCR via Ollama)
6. ✅ Voice: calls, grounded answers, barge-in, transcripts in the inbox; replies start ~3.5 s after the caller stops (`make voice-latency`)
