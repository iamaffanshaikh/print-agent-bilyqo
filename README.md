# Bilyqo Print Agent

Standalone TypeScript/Electron companion for Windows receipt printing. Runs at user login when enabled, remains in the tray, accepts authenticated loopback jobs, persists receipt jobs in SQLite, and sends raw ESC/POS through the Windows spooler. Node/Electron is bundled in the installer.

## Develop

Use Node 24 or newer. `npm ci`, then `npm start`. On macOS/Linux the agent uses preview mode: no hardware output, spool ID 0. `npm test` verifies formatting, command injection rejection, duplicate handling and API authorization. `npm run typecheck` checks TypeScript.

## Build the Windows installer

Run `npm run dist:win -- --publish never` on a Windows x64 machine, or run the included GitHub Actions workflow after pushing this separate project to a repository. Output: `release/BilyqoPrintAgent-Setup-0.1.2.exe`. This scaffold does not include a code signing certificate; configure signing credentials before distributing a production installer. The workflow creates an unsigned test build.

## Restaurant setup

1. Install the manufacturer's Windows printer driver. Confirm normal printer output.
2. Install the agent, select the printer, choose width and characters per line, save.
3. Print a test receipt (prints and cuts using the saved mode). Verify text wrapping and actual printable width. Width is a profile label; characters per line controls text wrapping, not printer mechanics.
4. Full cut is enabled by default. If needed, adjust the cutting mode, save and run Test cutter. Adjust feed lines to the minimum that clears the printhead-to-cutter distance. Generic commands are not universal; check the model manual if testing fails.
5. Enable start at login. Copy the pairing token to the authorized Bilyqo browser integration.

The first profile is printable ASCII with INR amounts and India timestamps. Unicode business/dish names, logos and QR codes require future raster/codepage profiles; unsupported text is rejected instead of silently corrupted. LAN printers installed in Windows can use the same spooler path. Direct network transport is not implemented.

## Website API (integration contract)

The restaurant website includes opt-in pairing and agent printing. API listens only at `http://127.0.0.1:17891`. Every request needs `Authorization: Bearer <pairing-token>`. Origin must match a configured HTTPS website origin. Host validation protects against DNS rebinding. Tokens are copied only through the trusted desktop UI, never returned by HTTP. Rotating the token disconnects previous clients. Local database is stored in Electron's per-user application data directory; access depends on the Windows user account.

POST `/v1/jobs` JSON:

```json
{
  "jobId": "3c173a45-c972-4f8f-a938-3bd758fd97be",
  "billNumber": "BILL-001",
  "businessName": "Example Restaurant",
  "issuedAt": "2026-10-06T12:00:00+05:30",
  "currency": "INR",
  "items": [{ "name": "Butter Naan", "quantity": 2, "unitPricePaise": 4500 }],
  "taxPaise": 0,
  "discountPaise": 0
}
```

GET `/v1/jobs/:id` polls status. GET `/v1/health` checks connectivity. POST returns 202 for new jobs, 200 for an identical existing job and 409 for conflicting IDs. Reuse the same ID for retries after a network failure. A deliberate reprint must use a new ID. Queue stores a snapshot of printer settings per job. Processing is serial. `submitted` means Windows accepted bytes, not confirmed physical printing. `uncertain` means submission failed or the agent stopped while sending; no automatic retry. Check physical output before creating a reprint.

## Browser connection release gate

Loopback HTTP access from a hosted HTTPS page varies by browser and local-network permission policy. CORS and private-network response headers are present, but do not guarantee browser acceptance. Validate on the actual Windows browser before integrating the live Print button. If blocked, implement a trusted local TLS setup or an outbound authenticated cloud relay. Do not disable browser security or expose the port on the LAN. Receipt printing is local, but this does not make the hosted restaurant app work offline.

## Remaining production validation

- Windows version / x64 compatibility, real printer model and raw ESC/POS support.
- Driver enumeration and permissions under the actual cashier account; test USB/LAN, paper-out, disconnect, partial writes, restart and cutter behavior.
- Pairing UI in the Bilyqo website, browser connectivity and physical print confirmation flow.
- Installer execution, login startup, signed distribution, Windows update installation and data retention policy.

The Windows helper is a fixed PowerShell script with a small C# Winspool wrapper. Parameters are passed via a temporary JSON file; no user-controlled shell command interpolation. PowerShell runs without a shell, with a timeout. Enterprise policy may block its execution; validate deployment policy or replace it with a compiled signed helper. Input receipt text cannot contain escape/control commands. Printer errors are conservatively marked uncertain.

## Dependency audit

Production dependencies report zero known vulnerabilities at initial verification. The full dependency audit reports eight moderate findings in electron-builder development tooling through sprintf-js. Review upstream patches before release; do not claim a clean full audit.

`npm run test:ui` launches a hidden Electron window, exercises saving settings and submitting a preview test job, and writes desktop/compact screenshots to the operating system temporary directory.

## Bilyqo website connection

The restaurant order screen now has a Printing method control. Choose Bilyqo local print agent, paste the token copied from this app, and click Connect & apply. Browser printing stays available through the same control. Sales summaries and detailed sales also use the configured agent. Pairing settings and pending job IDs are scoped to the current account in this browser's local storage.

Website payloads include optional orderType, customerPhone and paymentMode fields. Print submission does not settle the order; the cashier confirms physical output before saving the bill. Identical receipt attempts reuse the persisted job ID. Changing receipt contents creates a new job. To intentionally reprint an unchanged receipt, check the existing output, then use browser printing; a dedicated agent reprint action is not included yet.

The first Windows x64 installer has been built on macOS through electron-builder. Treat it as a test installer until it has been executed on Windows and verified with the actual printer. Code-signing is not configured even if build-tool logs mention signing steps.

## Version 0.1.1

Full cutting is enabled by default for both test receipts and website receipts. Receipt text, trailing feed and cut command are sent together as one job. Existing installations upgrade the original disabled-cut setting to full cut once; later explicit choices to disable cutting are preserved. Existing queued job snapshots are retained. Install over version 0.1.0 to keep the selected printer and pairing token. The printer must support ESC/POS automatic cutting; full versus partial behavior depends on its hardware.
# print-agent-bilyqo

## Client updates (version 0.1.2 onward)

Install version 0.1.2 once on each client PC to add the Update button. After that, clients click **Update** to check and download the latest version, then **Restart & install** to apply it. Printer settings, receipt history and pairing tokens stay in the existing user data directory. Downloads do not interrupt printing; installation requires the queue to finish and briefly stops the local API. Updates are supported in installed Windows builds only. Failed downloads can be retried with Update.

The update source is the public GitHub Releases of `iamaffanshaikh/print-agent-bilyqo`. The repository/releases must be publicly accessible to client PCs; private repositories need a separate public update distribution source. Do not embed a GitHub access token in the client app.

To ship new features:

1. Increase `version` in package.json and refresh the lockfile with `npm install --package-lock-only`.
2. Commit and push the changes.
3. Create and push the matching version tag, for example `git tag v0.1.2` then `git push origin v0.1.2`.
4. The Windows workflow tests/builds the app and publishes the installer, `.blockmap` and `latest.yml` in a GitHub Release. All three files are needed for update distribution. Workflow dispatch alone creates downloadable build artifacts; it does not publish an update.

The version tag must match package.json. Publish stable releases with increasing versions. This change does not publish a release automatically. Verify the first upgrade on Windows (including restarting a tray-hidden app and retaining settings/token) before asking clients to update.

## Version 0.1.2

The /v1/jobs API also accepts kind: sales-report with title, periodLabel, totalPaise, billCount, sections (heading and rows with label, amountPaise and indent), and notes. Summary and detailed sales reports print through the same persistent queue and cut once at the end. Health advertises the sales-report capability. Update the Windows agent to this version to use website report printing.
