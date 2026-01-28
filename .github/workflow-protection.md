# Workflow File Protection

The `.github/workflows/ci.yml` file is protected from accidental modifications using `git update-index --skip-worktree`.

## If you need to modify the workflow file:

1. Remove the skip-worktree flag:
   ```bash
   git update-index --no-skip-worktree .github/workflows/ci.yml
   ```

2. Make your changes and commit them

3. Re-apply the protection:
   ```bash
   git update-index --skip-worktree .github/workflows/ci.yml
   ```

## Why this is needed:

The workflow file requires special OAuth permissions (`workflow` scope) to push, which causes push failures when accidentally modified. This protection prevents accidental modifications while still allowing intentional changes when needed.
