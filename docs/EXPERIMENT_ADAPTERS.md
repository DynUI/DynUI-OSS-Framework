# Experiment Adapters

DynUI experiments operate at the component or variant level. Your existing
experiment platform can remain the assignment source; DynUI only needs the
assignment result when generating and validating a tree.

## Adapter Shape

Implement `AssignmentAdapter` when you want GrowthBook, Statsig, LaunchDarkly, or
another system to decide variants:

```ts
import type { AssignmentAdapter, ExperimentDef } from "@dynui/experiments";
import type { SignalProfile } from "@dynui/contracts";

export class ExternalAssignmentAdapter implements AssignmentAdapter {
  async assign(exp: ExperimentDef, profile: SignalProfile) {
    return lookupVariantInYourSystem(exp.id, profile.subject.anonId);
  }
}
```

Pass the adapter into `ComponentExperimentEngine`, then pass assignments into
`generateScreen`.

## Exposure Discipline

Record exposure only after a component is actually rendered. A component can be
eligible for an experiment but still excluded by consent, data, layout, or surface
constraints.

## Example

See [`examples/integrations/growthbook-assignment.ts`](../examples/integrations/growthbook-assignment.ts)
for a GrowthBook/Statsig-style adapter and
[packages/experiments/README.md](../packages/experiments/README.md) for the
analysis API.
