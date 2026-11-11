## Impeccable Design Skill Reference
<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 10:20pm</small>

Impeccable is a design add-on (a "skill") for AI coding agents. It gives the agent design rules and a set of
`/impeccable` commands for reviewing and improving screens. It is not a program you use on its own: **you type its
commands into Claude Code (or Codex), and the agent does the work.**

Source: [pbakaus/impeccable on GitHub](https://github.com/pbakaus/impeccable)

### 1. Where it runs

| Place | Runs Impeccable? | Why |
|---|---|---|
| **Claude Code on this computer** (the `claude` terminal program, or the Code tab of the Claude desktop app, opened on `D:\Repos\krhomebase`) | **Yes** | It reads the skill from the repository's `.claude\skills\impeccable` folder. |
| **Codex on this computer** | Supported by Impeccable, but **not installed here** | This repository was installed for Claude only (`--providers=claude`). Codex needs its own install run. |
| **Cloud chats** (claude.ai, the Claude app's chat, cloud sessions) | **No** | They cannot see the repository's `.claude` folder. Typing `/impeccable` there does nothing. |

### 2. Two kinds of commands: know which window you are typing in

This document marks every command with one of two labels:

- **▶ POWERSHELL**: typed in a PowerShell window, in `D:\Repos\krhomebase`. These install, update or start things.
- **▶ CLAUDE CODE PROMPT**: typed into Claude Code's prompt, where you would write a request to the agent. Every
  command that starts with `/impeccable` goes here, never in PowerShell.

### 3. Install (once per repository)

**▶ POWERSHELL**
```powershell
Set-Location D:\Repos\krhomebase
pnpm dlx impeccable install --providers=claude --scope=project
```

- Use `pnpm dlx`, not `npx`. This repository names pnpm in `devEngines`, so `npx` (npm's tool) stops with
  `EBADDEVENGINES` (rule in the root `AGENTS.md`).
- `--scope=project` installs into this repository only, not into every project on the computer.
- Accept the "design hook" when the installer offers it (a check that runs after the agent edits UI files).
- What it creates:
  - `.claude\skills\impeccable\`: the skill, its reference files and its engine (`impeccable.exe`). Commit it.
  - `.claude\agents\impeccable-*.md`: four helper agents. Commit them.
  - `.claude\settings.local.json`: the design hook. Claude Code treats this file as one person's own settings;
    decide whether it belongs in the repository.

Then restart Claude Code so it loads the skill:

- **Desktop app:** closing the window only hides it in the system tray. Right-click the Claude icon in the tray
  (bottom right; click `^` if hidden) and choose **Quit**, or press `Ctrl+Q`. Start it again from the Start menu.
- **Terminal:** type `/exit` (or press `Ctrl+C` twice), then start it again:

**▶ POWERSHELL**
```powershell
Set-Location D:\Repos\krhomebase
claude
```

Check: **▶ CLAUDE CODE PROMPT** `/impeccable` on its own lists the commands. If nothing is listed, Claude Code was
not restarted, or you are in a cloud chat.

### 4. Set up (once per repository)

**▶ CLAUDE CODE PROMPT**
```text
/impeccable init
/impeccable document
```

- `init` asks what it cannot work out (who uses the app, what it is for) and writes `PRODUCT.md`.
- `document` reads the existing screens and writes `DESIGN.md`, the record of the current visual system. This is
  how Impeccable learns the look of Contacts and Billing.
- Tell it this project's styling rules when it asks, or add them to the prompt:
  - Tailwind classes in `LAYOUT_STYLES` and `STYLES` maps; no CSS files;
  - values a user may configure stay `--kr-theme-*` tokens in `apps\web\styles\theme.css`;
  - three designed screen widths;
  - the full rules: `AGENTS_05_coding-style-tailwindcss.md`.

### 5. Everyday use

**▶ CLAUDE CODE PROMPT**, in the form `/impeccable <command> <target>`. The target is plain words or a file path:
```text
/impeccable critique the Billing Invoices tab (apps/web/features/billing/components/InvoicesTab.client.tsx)
```

Work in this order: review first, then change one area at a time.

| Group | Command | What it does |
|---|---|---|
| Review | `critique` | Scored usability review |
| | `audit` | Technical quality report |
| Steer | `layout` | Spacing and rhythm |
| | `typeset` | Fonts, hierarchy, sizes |
| | `colorize` / `quieter` / `bolder` | More color / calmer / stronger |
| | `distill` | Removes what the screen does not need |
| | `clarify` | Rewrites unclear wording |
| | `animate` / `delight` / `overdrive` | Motion, personality, advanced effects |
| Finish | `polish` | Final pass before shipping |
| | `harden` | Errors, overflow, edge cases |
| | `adapt` | Screen sizes and devices |
| | `optimize` | Loading and drawing speed |
| | `onboard` | First-use flows and empty screens |
| Plan | `shape` | Plans the experience before code |
| | `extract` | Moves repeated patterns into the design system |
| Live | `live`, `generate` | Variants in the browser (section 6) |

### 6. Live mode (optional)

Click an element in the browser, cycle through design variants, and accept one; Impeccable writes it into the code.

**Safety first.** When no Claude Code session is active, live mode's Apply runs Claude Code with all permission
checks turned off. That bypasses this repository's rules (no database writes, no commits). Set the variable below
in the same PowerShell window every time, so Apply goes through your Claude Code session instead.

**▶ POWERSHELL** (window 1: the app)
```powershell
Set-Location D:\Repos\krhomebase
$env:IMPECCABLE_LIVE_COPY_AGENT = 'chat'
pnpm run dev
```

**▶ POWERSHELL** (window 2: Claude Code, with the same variable)
```powershell
Set-Location D:\Repos\krhomebase
$env:IMPECCABLE_LIVE_COPY_AGENT = 'chat'
claude
```

**▶ CLAUDE CODE PROMPT**
```text
/impeccable live
```

Use live mode on this computer only (`localhost:3011`), never on krhomebase.com.

### 7. Update

**▶ POWERSHELL**
```powershell
Set-Location D:\Repos\krhomebase
pnpm dlx impeccable update
```

### 8. Problems seen so far

| Problem | Cause | Fix |
|---|---|---|
| `EBADDEVENGINES` | `npx` used in this repository | Use `pnpm dlx` (section 3) |
| `/impeccable` does nothing | Typed in a cloud chat, or Claude Code not restarted after install | Use Claude Code on this computer; quit and restart it |
| Closing Claude does not restart it | The window close only hides the app | Tray icon → **Quit**, or `Ctrl+Q` |
