# Contributing to Face+ZK SDK

## Setup

```bash
git lfs install
git clone <repo-url>
git lfs pull
npm install
```

## Branch Naming

- `feat/<description>` — new features
- `fix/<description>` — bug fixes
- `audit/<description>` — audit / remediation branches
- `chore/<description>` — maintenance tasks

## Making Changes

1. Branch from `main`.
2. Make your changes; run `npx tsc --noEmit` to check for type errors.
3. Update `CHECKLIST.md` if your change addresses an open audit finding.
4. Open a PR against `main`.

## Pull Requests

- Keep PRs focused — one concern per PR.
- Include a clear description of what changed and why.
- Link any relevant audit findings or issues.

## Asset Files (Models / WASM)

Model files (`.onnx`, `.wasm`) are stored in Git LFS. If you add new asset files, ensure they are tracked by LFS:

```bash
git lfs track "*.onnx" "*.wasm"
git add .gitattributes
```
