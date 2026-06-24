/**
 * test:visual — browser-based proof that valid fixture trees render a COHERENT
 * screen (not just "resolved to items"), and that an invalid/unknown composition is
 * surfaced by the safe fallback UI rather than blanking or crashing.
 *
 *   npm run test:visual
 *
 * It drives a headless Chromium over a self-contained harness (`harness.html`) for
 * every scenario × viewport, asserting: non-blank page, expected component text,
 * no "Unregistered component" / "Invalid composition" for VALID fixtures, stable
 * screenshot dimensions, and a basic pixel check (a real, sized, non-transparent
 * card is painted). Screenshots are written to ./__screenshots__ (gitignored).
 *
 * If no browser is available it SKIPS with a clear message and exits 0 (the visual
 * suite is documented as required-before-release; see packages/.../README + Phase 7).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { buildScenarios, type VisualScenario } from "./scenarios.js";

const HERE = import.meta.dirname;
const HARNESS_URL = pathToFileURL(join(HERE, "harness.html")).href;
const SHOTS = join(HERE, "__screenshots__");
const SHOTS_LABEL = relative(process.cwd(), SHOTS) || ".";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
];

type LoadResult =
  | { ok: true; browser: import("playwright").Browser }
  | { ok: false; error: string };

async function loadChromium(): Promise<LoadResult> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    return { ok: true, browser };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

async function checkScenario(
  browser: import("playwright").Browser,
  scenario: VisualScenario,
  viewport: { name: string; width: number; height: number },
): Promise<Check[]> {
  const tag = `${scenario.id}-${viewport.name}`;
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const checks: Check[] = [];
  try {
    await page.goto(HARNESS_URL);
    const painted = await page.evaluate((s) => (window as unknown as { renderScreen: (x: unknown) => { items: number } }).renderScreen(s), scenario as unknown);

    const text = (await page.locator("#root").innerText()).trim();
    const has = (sub: string) => text.includes(sub);

    checks.push({ name: "non-blank", ok: text.length > 0, detail: `${text.length} chars` });
    checks.push({ name: "painted-items", ok: painted.items > 0, detail: `${painted.items} items` });

    for (const want of scenario.expectText) {
      checks.push({ name: `text:"${want}"`, ok: has(want) });
    }

    const unregistered = await page.locator(".unregistered").count();
    const invalid = await page.locator(".invalid-composition").count();
    if (scenario.expectUnregistered) {
      checks.push({ name: "safe-fallback-shown", ok: unregistered > 0 && has(scenario.expectUnregistered) });
    } else {
      checks.push({ name: "no-unregistered", ok: unregistered === 0, detail: `${unregistered}` });
      checks.push({ name: "no-invalid-composition", ok: invalid === 0, detail: `${invalid}` });
    }

    // Basic pixel check: a real, sized, non-transparent surface is painted.
    const firstSurface = await page.locator(".card, .unregistered").first();
    const box = await firstSurface.boundingBox();
    const bg = await firstSurface.evaluate((n) => getComputedStyle(n).backgroundColor);
    const sized = !!box && box.width > 40 && box.height > 20;
    const opaque = bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
    checks.push({ name: "pixel:sized-opaque-surface", ok: sized && opaque, detail: `${box?.width}x${box?.height} ${bg}` });

    // Stable screenshot at the requested dimensions.
    mkdirSync(SHOTS, { recursive: true });
    const shot = await page.screenshot({ path: join(SHOTS, `${tag}.png`) });
    const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    checks.push({ name: "screenshot-nonempty", ok: shot.length > 1000, detail: `${shot.length}B` });
    checks.push({ name: "viewport-stable", ok: size.w === viewport.width, detail: `${size.w}x${size.h}` });
  } finally {
    await page.close();
  }
  return checks.map((c) => ({ ...c, name: `${tag} · ${c.name}` }));
}

async function main() {
  const loaded = await loadChromium();
  if (!loaded.ok) {
    console.log("test:visual — SKIPPED (no browser available).");
    console.log(`  ${loaded.error.split("\n")[0]}`);
    console.log("  Install a browser with:  npx playwright install chromium");
    return;
  }
  const { browser } = loaded;

  const scenarios = buildScenarios();
  const results: Check[] = [];
  try {
    for (const scenario of scenarios) {
      for (const viewport of VIEWPORTS) {
        results.push(...(await checkScenario(browser, scenario, viewport)));
      }
    }
  } finally {
    await browser.close();
  }

  const failures = results.filter((r) => !r.ok);
  const summary = { total: results.length, failed: failures.length, scenarios: scenarios.length, screenshots: SHOTS_LABEL };
  writeFileSync(join(SHOTS, "report.json"), JSON.stringify({ summary, results }, null, 2));

  console.log(`test:visual — ${scenarios.length} scenarios × ${VIEWPORTS.length} viewports`);
  for (const f of failures) console.error(`  ✗ ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  if (failures.length) {
    console.error(`\n${failures.length}/${results.length} visual checks failed`);
    process.exit(1);
  }
  console.log(`✓ all ${results.length} visual checks passed — screenshots in ${SHOTS_LABEL}`);
}

await main();
