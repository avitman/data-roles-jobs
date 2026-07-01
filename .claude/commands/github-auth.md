# /github-auth

Verify and enforce that the active GitHub account is `avitman`. Sign in via Device Flow if needed.

## What to do

1. Check that `gh` is installed:
   ```bash
   which gh
   ```
   If not found, tell the user to install it: `brew install gh` on Mac, or visit https://cli.github.com.

2. Check current auth status and detect any wrong accounts:
   ```bash
   gh auth status
   ```
   Parse the output:
   - If the active account is already `avitman` → tell the user everything looks good and stop.
   - If a **different** account is active (e.g. a personal account), proceed to steps 3–5.
   - If no account is logged in at all, skip to step 4.

3. If a wrong account is active, log it out first:
   ```bash
   gh auth logout
   ```
   Confirm which account is being removed before running this.

4. Log in with the correct account via Device Flow:
   ```bash
   gh auth login --web
   ```
   Tell the user: open the printed URL, enter the one-time code, and make sure to authorize with the **avitman** GitHub account (not a personal one).

5. Confirm the result:
   ```bash
   gh auth status
   ```
   Verify the output shows `avitman` as the logged-in account. If it still shows a wrong account, repeat from step 3.
