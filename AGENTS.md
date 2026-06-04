# AGENTS.md — read this before running git here

This workspace is managed by **`rv`** (repoverse). Some submodule paths are
**not real submodules on disk** — they are symlinks to a single shared copy
under `repos/`. Naive git commands will fight these and can corrupt the tree.
**Read the rules below before any git submodule / branch operation.**

## What `rv` is

Source / docs: <https://github.com/madhavajay/repoverse>
Crates.io: <https://crates.io/crates/repoverse>

Install:

```sh
cargo install repoverse
```

For unreleased fixes, install from source:

```sh
cargo install --git https://github.com/madhavajay/repoverse --bin rv
```

`rv` (repoverse) deduplicates repos that are vendored in multiple places.
Instead of N copies of a dependency, there is **one** real checkout in
`repos/<name>` and every original path is a symlink to it — so you edit it
once and every consumer sees the change. `.gitmodules` and gitlinks are kept
intact, so a plain `git clone --recursive` of any sub-repo still works
standalone; `rv` is a *layer on top*, not a replacement.

`rv` is primarily for local development workspaces where repeated vendored
repos are overlaid with shared symlinks. GitHub CI usually does **not** need
Repoverse: use normal `actions/checkout` with recursive submodules unless a
workflow explicitly wants to test the Repoverse overlay itself. CI should remain
valid for classic `git clone --recursive` checkouts, because `.gitmodules` and
gitlinks are still the canonical standalone representation.

Get help:

```sh
rv --help            # all commands
rv help <command>    # detail for one command
rv status            # super git status: dirty repos + changed files
rv status <repo>     # symlink-safe git status for one checkout
rv pull <repo>       # symlink-safe pull for one checkout
rv layout            # real checkouts vs shared symlink paths
rv adopt --plan      # dependency/dedup map for the current workspace
```

## Current layout of THIS workspace

- `bioscript` and `exvitae/bioscript` are **symlinks** → `repos/bioscript`
  (one shared copy, branch `main`).
- Inside `repos/bioscript`, these are **symlinks** → its own `repos/`:
  `vendor/rust/htslib-rs`, `vendor/rust/bcftools-rs/htslib-rs`,
  `vendor/rust/samtools-rs/htslib-rs` → `repos/htslib-rs` (branch `main`);
  `noodles` → `repos/noodles` (branch `madhava/bioscript`).
- The real, editable checkouts are the `repos/<name>` dirs. Edit those (or
  any symlink to them — same files).

## Rules for git operations

1. **Never run `git submodule update` / `git pull --recurse-submodules` /
   `git checkout <branch>` / `git reset --hard` on a repo that contains
   shared symlinks** (e.g. `bioscript`, or the workspace root) without
   un-overlaying first. git expects gitlinks at those paths, finds symlinks,
   and aborts mid-operation — leaving a half-applied/corrupt state.

2. **Golden workflow for history surgery** (pull, rebase, branch switch,
   reset) on an overlaid repo:

   For ordinary remote updates, prefer the Repoverse wrapper:

   ```sh
   rv pull exvitae
   rv pull --rebase exvitae
   ```

   For lower-level history surgery that `rv` does not wrap yet:

   ```sh
   rv unlink            # restore overlays -> real submodules (git is sane)
   #  ... do your git work (pull / checkout / rebase / reset) ...
   rv link              # re-establish the shared symlinks from config
   ```

3. **Editing dependency code:** just edit the file (via the symlink path or
   `repos/<name>` — identical). Commit/push in the real repo:
   `cd repos/<name> && git commit && git push`. One push updates every
   consumer.

4. **Propagating a dependency change to consumers' pinned SHAs:** use
   `rv rollup` (do not hand-edit gitlinks). It updates each consumer's
   committed submodule reference to the new SHA.

5. **Adding/removing a shared dep:** use `rv adopt --plan` then
   `rv adopt --step <repo>` (dry-run; add `--yes` to apply). Do not manually
   `mv` a submodule into `repos/` and symlink it — `rv` records it in
   `.repoverse.yaml` so `rv link` can rebuild it after a fresh clone.

6. **After a fresh `git clone` of this workspace:** run `rv link` to
   re-create the shared symlinks from `.repoverse.yaml`.

7. **If something looks wrong** (broken/looping symlinks, "expected
   submodule path not to be a symbolic link"): `rv unlink` to get back to
   plain submodules, fix with normal git, then `rv link`. Do not delete
   `repos/<name>` blindly — it may be the only editable copy.

## Status, commit, and rollup workflow

Use `rv status` as the first command before deciding what needs committing:

```sh
rv status
```

This is a Repoverse-aware replacement for `git status` at workspace scope. It
prints only dirty Repoverse checkouts and the changed files inside each one.
Those are the modules that may need commits.

To inspect one checkout independently, use:

```sh
rv status repos/exvitae
rv status exvitae
```

From inside a checkout, plain `rv status` checks that checkout only:

```sh
cd repos/exvitae
rv status
```

This intentionally runs Git with submodules ignored, so it still works when a
gitlink path has been overlaid by a shared symlink such as
`exvitae/bioscript -> ../bioscript`. Raw `git status` may fail in that case
with "expected submodule path ... not to be a symbolic link"; prefer
`rv status <repo>`.

Use `rv layout` when you need to understand where shared code lives:

```sh
rv layout
```

It shows the conceptual layers, real `repos/...` checkouts, and every shared
symlink path. It is for topology, not for deciding what to commit.

Commit dirty modules at their real checkout paths:

```sh
rv status
cd repos/<dirty-repo>
git add -A
git commit -m "..."
git push
```

After committing a dependency repo, roll the new SHA into consumers with
Repoverse rather than editing gitlinks by hand:

```sh
rv rollup --direct
rv status
```

Repeat until `rv status` is clean, or until the only remaining changes are the
consumer gitlink / lock updates you intend to commit next.

## PR and rollup rules

`rv rollup --direct` may create, push, and check out generated `rv/...`
branches. Do not assume the current branch after rollup is the intended human
PR branch.

Before opening PRs after a rollup, verify:

```sh
git branch --show-current
git branch -vv
rv status
```

Use `.repoverse.yaml` as the branch source of truth:

- `projects[].revision` is the intended stable/base branch for a Repoverse
  project.
- `links[].branch` is the expected branch for an overlaid symlink location.
- GitHub's default branch is not necessarily the right PR base.

PRs should target the repo's active `origin` remote only, unless the user
explicitly asks for an upstream/fork PR. Do not open PRs against unrelated
upstream remotes just because they exist.

If the desired base branch and head branch are the same branch, do not open a
PR. The change has already landed on that branch; report the commit/branch
state instead.

## Config

- `.repoverse.yaml` (workspace root) — the central source of truth:
  `provides:` (shared repos) and `links:` (every symlinked location).
- A `.repoverse.yaml` inside a sub-repo (e.g. `repos/bioscript/`) makes it
  its own nested workspace; nearest config wins for that subtree.

When in doubt: `rv status` first for dirty work, `rv layout` for topology,
`rv --help`, and prefer `rv` commands over raw `git submodule` here.
