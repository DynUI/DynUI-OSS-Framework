# Adoption walkthrough: a non-fitness domain (news feed)

The reference app is a fitness tracker, but nothing in the framework is fitness-
specific. This walkthrough adopts DynUI for a completely different domain — a
**news story feed** — using only domain artifacts (a manifest + a signal model), with
**no core code changes and no model calls**. The runnable version is
[`examples/no-model-demo.ts`](../examples/no-model-demo.ts) (`npm run demo:no-model`).

The goal: the same `story-feed` surface renders differently for a **skimmer**, a
**reader**, and a **commenter**, deterministically.

## 1. Declare the component vocabulary (manifest)

[`examples/news/manifest.json`](../examples/news/manifest.json) registers four
components — `story-headline`, `top-article`, `headline-list`, `comment-thread` — each
with a behavioral contract (surface, audience, `showWhen`/`hideWhen`, data, priority).
This is the **only** vocabulary the generator may use. Validate and lint it:

```bash
npx dynui validate examples/news/manifest.json
npx dynui lint examples/news/manifest.json
```

## 2. Define the domain's signal model

[`tests/fixtures/domains/news/signal-model.json`](../tests/fixtures/domains/news/signal-model.json)
maps behavior signals to **segments** (`skimmer`, `reader`, `commenter`) — e.g. a high
`news.engagement.articles.readRate` leans *reader*; a high
`news.engagement.social.commentRate` leans *commenter*. Inference is a core function;
the model is data:

```ts
import { inferSegment } from "@dynui/signal";
const archetype = inferSegment(profile, newsSignalModel); // → { primary, confidence, ... }
```

## 3. Resolve a profile

In production a `ProfileAdapter` turns your user id into a `SignalProfile` (PII stays
on your side; consent is deny-by-default). Here we build profiles directly with three
behavior shapes (skimmer / reader / commenter) and explicit consent.

## 4. Generate deterministically and validate

```ts
import { generateScreen, HeuristicModelProvider } from "@dynui/generate";

const res = await generateScreen(new HeuristicModelProvider(), {
  surface: "story-feed",
  profile,
  manifest,
  constraints: manifest.constraints,
  experiments: [],
  data,
});
// res.validation.ok === true; res.usedFallback === false  (no model was called)
```

`generateScreen` validates with the full render context internally. If you ever render
a tree from elsewhere, gate it first with
`validateRenderableTree(tree, manifest, { surface, profile, data, experiments })`.

## 5. Observe the result

Running `npm run demo:no-model` prints (segments and components vary by behavior):

```
skimmer    → segment skimmer   · valid=true · story-headline, headline-list
reader     → segment reader    · valid=true · story-headline, top-article, ...
commenter  → segment commenter · valid=true · story-headline, top-article, comment-thread
```

Same surface, same manifest, three different structures — chosen deterministically,
validated before render, with no model and no changes to any `@dynui/*` package. To go
live, swap the `HeuristicModelProvider` for a model provider for background/cache-
warming generation (optional), and wire a real `ProfileAdapter` and renderer registry
— see [QUICKSTART.md](QUICKSTART.md).
