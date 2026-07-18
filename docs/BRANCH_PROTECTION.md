# Branch Protection

Configure GitHub branch protection or a repository ruleset before making the
repository public or accepting external contributions.

## Target

- Branch: `main`
- Applies to: administrators and maintainers too, unless temporarily disabled for
  an emergency release

## Required Settings

Enable these settings for `main`:

- require a pull request before merging;
- require at least one approving review;
- dismiss stale approvals when new commits are pushed;
- require review from Code Owners;
- require status checks to pass before merging;
- require branches to be up to date before merging;
- require conversation resolution before merging;
- block force pushes;
- block branch deletion.

## Required CI Checks

Require these status checks from `.github/workflows/ci.yml`:

- `test (node 22)`;
- `test (node 24)`;
- `package publish smoke test`;
- `dependency review`.

Do not require the release workflow. It runs only for releases or manual publish
checks, not for every pull request.

The OpenSSF Scorecard workflow is useful for supply-chain visibility, but it is
not a merge gate by default because it runs on `main`, on a weekly schedule, and
on branch-protection events.

## GitHub UI Path

Use one of these GitHub settings paths:

- Settings -> Branches -> Add branch protection rule -> Branch name pattern:
  `main`;
- Settings -> Rules -> Rulesets -> New branch ruleset -> Target branches:
  `main`.

After saving, open a test pull request and confirm that GitHub blocks merging
until the required checks pass.
