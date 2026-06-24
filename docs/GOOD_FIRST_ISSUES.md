# Good First Issue Seeds

These are ready-to-file issue drafts for GitHub once the repository is public.

1. **Add a minimal Next.js renderer example**
   - Create a tiny web renderer that consumes a valid `UITree` and registry.
   - Keep it deterministic and model-free.

2. **Add CLI examples for every `dynui schema` artifact**
   - Extend `packages/cli/README.md` with copy-pasteable commands.
   - Include expected output shape, not full schema dumps.

3. **Document manifest diff review examples**
   - Add examples of breaking and non-breaking `diffManifest` output.
   - Link from `docs/FIGMA_EXPORT.md`.

4. **Add a renderer compatibility failure fixture**
   - Add a small fixture showing a manifest component missing from the renderer.
   - Assert the compatibility error is actionable.

5. **Improve no-consent example output**
   - Add comments to `examples/no-model-demo.ts` explaining why the neutral modules
     were selected.

6. **Add telemetry sink retry guidance**
   - Extend `examples/integrations/warehouse-telemetry-sink.ts` docs with retry and
     dead-letter recommendations.

7. **Add a manifest authoring lint troubleshooting page**
   - List common lint errors and fixes.
   - Link from `docs/QUICKSTART.md`.

8. **Add screenshots for mobile visual fixtures**
   - Promote one mobile visual-test screenshot into `docs/assets/`.
   - Add alt text and README/docs references.
