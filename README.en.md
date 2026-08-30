# MsgEater

<p align="center">
  <a href="https://github.com/oscarhenriquezg/msgeater/actions/workflows/ci.yml"><img src="https://github.com/oscarhenriquezg/msgeater/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/oscarhenriquezg/msgeater/actions/workflows/codeql.yml"><img src="https://github.com/oscarhenriquezg/msgeater/actions/workflows/codeql.yml/badge.svg" alt="CodeQL" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/oscarhenriquezg/msgeater"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.scorecard.dev%2Fprojects%2Fgithub.com%2Foscarhenriquezg%2Fmsgeater&label=openssf%20scorecard&query=%24.score&suffix=%2F10" alt="OpenSSF Scorecard" /></a>
  <a href="https://www.bestpractices.dev/projects/14357"><img src="https://www.bestpractices.dev/projects/14357/badge" alt="OpenSSF Best Practices" /></a>
  <a href="https://github.com/oscarhenriquezg/msgeater/releases/latest"><img src="https://img.shields.io/github/v/release/oscarhenriquezg/msgeater" alt="Latest release" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/github/license/oscarhenriquezg/msgeater" alt="License" /></a>
</p>

<p align="center">
  <a href="README.md">Español</a> · <b>English</b>
</p>

<p align="center">
  <img src="assets/icon-source/png/MsgEater-256x256.png" alt="MsgEater icon" width="128" />
</p>

Lightweight, cross-platform desktop viewer (**Linux and macOS**) for Microsoft
Outlook `.msg` files. Works **100% offline**: your mail never leaves your
machine.

![MsgEater main window showing an email and the export menu](assets/screenshots/main-window.png)

## Motivation

On macOS and Linux there is no native way to open a `.msg` file received from a
corporate Windows/Outlook environment. The scenario is common: a support
ticket, an email forwarded by a colleague, an attachment in a work management
system… and there it is, a `.msg` your system cannot open.

Existing alternatives don't solve the problem well:

- **Installing Outlook** is not an option on Linux, and on macOS it means a
  Microsoft 365 subscription just to read a single file.
- The **desktop viewers** that do exist tend to break the message formatting
  (they lose the original HTML, show partial headers), fail to display
  attachments properly, or are abandoned/unsafe projects that execute the
  email's content without sanitizing it.
- **Online converters and viewers** are arguably the worst option: you upload
  an email — sometimes confidential, with customer or company data — to a
  third-party server you know nothing about. What do they do with the content?
  How long do they keep it? The addresses they extract likely end up feeding
  spam databases, attachments are exposed to being copied or leaked, and the
  message body — which may contain sensitive information — becomes accessible
  to whoever operates that service. On top of that, uploading corporate mail to
  an unauthorized tool usually violates company data-handling policies outright,
  and many of these sites are sustained by aggressive advertising or are simply
  a front to install other software: the "free viewer" is, in fact, the product
  that monetizes your email.

MsgEater was born out of frustration with all of this: distrust of a closed,
proprietary format like `.msg`, and the lack of a decent, open and safe
alternative to read it without handing control of that data to anyone. Hence
the name and the icon too: a Tux that eats `.msg` files to digest them — parse
them, sanitize them — and display them without letting them leave your machine.

## Features

### 📬 Viewing

| Feature | Detail |
|---|---|
| **Input formats** | `.msg` (Outlook), `.eml` (RFC 5322) and `.emlx` (Apple Mail), with **content-based detection** (a renamed extension still opens) |
| **Complete metadata** | Subject, sender, recipients (To/CC/BCC), sent and received dates |
| **Body fallback chain** | Native HTML → de-encapsulated RTF (recovers Outlook's original HTML) → approximate RTF → plain text |
| **Embedded images** | `cid:` images render in place; remote ones are blocked (placeholder) and only load on click, after a tracking warning |
| **Nested messages** | An attached `.msg`/`.eml` opens in **its own window** for side-by-side comparison |
| **Exchange addresses** | Resolves the real SMTP address instead of the internal X.500 DN (`/o=ExchangeLabs/...`) |
| **Language and theme** | Spanish/English following the system · automatic light/dark |

### 🔒 Security and privacy

| Feature | Detail |
|---|---|
| **Hostile content** | The body is sanitized (DOMPurify) and isolated in a sandboxed iframe with no scripts + a restrictive CSP |
| **No network** | Zero automatic outbound traffic: blocked at the session layer (verifiable with `tcpdump`), zero telemetry. The only exception is downloading a remote image you explicitly ask for |
| **Remote images** | Blocked by default. Clicking the placeholder shows a warning explaining the tracking (tracking pixel: IP, date/time of reading) before downloading it |
| **Anti-phishing** | Every link's real URL is shown on hover; clicking requires confirmation before leaving to the browser, and if the link is deceptive the warning itself explains why |
| **Deceptive links** | Optional highlighting of links whose text suggests a different domain than the real target (`<a>paypal.com</a>` → `evil.com`) |
| **Unlink** | One button renders every link inert (struck through) so you can inspect suspicious mail safely |
| **Office macros** | Flags a `.docm`/`.xls`/… carrying a VBA project, without opening or running it |
| **Attachments under control** | Only written to disk on an explicit action; temporary files from "Open" are purged on exit |

### 🛠️ Actions and export

| Feature | Detail |
|---|---|
| **Toolbar** | [Lucide](https://lucide.dev) icons: New · Open · Save as · Copy · Find · body zoom · darken body · Unlink · highlight deceptive links · source view · Export · About (Print stays in the menu, Ctrl+P) |
| **Export** (9 formats) | **PDF** (A4/Letter), **EML**, **PNG** (+copy to clipboard), **HTML**, **TXT**, **Markdown**, **MHT** (web page with embedded images), **JSON** (pipelines) and **ZIP** (message + metadata + bodies + attachments) |
| **Save as…** | A dialog with **the same formats as Export** (plus the original); the format follows the chosen extension (Ctrl+S) |
| **Copy with formatting** | Copies the selection (or the whole body) preserving rich text and images |
| **Draggable attachments** | Drag an attachment out of the app to drop it in your file manager or a new email |
| **Accessibility** | Body zoom and high-contrast mode (dark background, light text) independent of the window |
| **Print** | System dialog for the message and its headers (Ctrl+P) |
| **Search** | In the body (Ctrl+F): highlighting, match counter and scroll to match |
| **Attachments** | Click to Open with the default app or Save; "Save all" with verified integrity |
| **Copy** | Addresses with one click (or all of a field) · metadata as text or JSON |
| **Recent files** | Last 10, persistent, in the File menu |
| **OS association** | Dialog to choose which types (.msg/.eml/.emlx) the app opens (Linux via xdg-mime; Finder guide on macOS) |

### 🔬 Technical analysis (source view)

| Feature | Detail |
|---|---|
| **Syntax highlighting** | Headers, HTML tags/attributes and base64 blocks, with search, copy, print and export |
| **Message path** | Chronological `Received` chain with the **delay between hops** and **SPF/DKIM/DMARC** results |
| **Decoder** | Select base64 or quoted-printable and decode it in place |
| **Raw MAPI properties** | Full PidTag table of the `.msg` (forensic) |
| **Sanitization diff** | Exact list of the scripts/handlers the email carried and that were removed |

## Installation

### Quick install (one line)

Works on **Linux and macOS**; the script detects your system and downloads the
right artifact. If you already have a version installed, it updates it (and if
you came from a different method than the one your distro now resolves to, it
offers to clean up the previous one so you don't end up with duplicate menu
entries):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/oscarhenriquezg/msgeater/main/scripts/install.sh)"
```

- **Linux** — detects your distro family: `.deb` on Debian/Ubuntu/Mint…,
  `.rpm` on Fedora/RHEL/openSUSE… (both through the system package manager,
  which asks for sudo). If it recognizes neither, it falls back to the AppImage
  in `~/.local/bin` with its own menu entry (no root required).
- **macOS** — installs `MsgEater.app` into `~/Applications` and removes the
  Gatekeeper quarantine attribute (the app is unsigned).

> On Linux, if it ends up using the AppImage, that requires **FUSE2**
> (`libfuse2`). If you see a FUSE error on startup, install it
> (`sudo apt install libfuse2` / `sudo dnf install fuse fuse-libs`) or run with
> `~/.local/bin/MsgEater.AppImage --appimage-extract-and-run`.

### Manual (and verifiable) download

The quick install above prioritizes convenience. If you'd rather check for
yourself that the binary corresponds exactly to this repo's code before running
it, download manually from
[Releases](https://github.com/oscarhenriquezg/msgeater/releases) — every
release includes `SHA256SUMS` and a signed (Sigstore)
[GitHub Artifact Attestation](https://docs.github.com/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds)
per artifact. Full steps, with commands for Linux and macOS, are in
**[docs/VERIFY-RELEASE.md](docs/VERIFY-RELEASE.md)**.

**Linux** — AppImage (recommended, any distro with glibc ≥ 2.35), `.deb` or `.rpm`:

```bash
chmod +x "MsgEater-x.y.z-x86_64.AppImage"
./"MsgEater-x.y.z-x86_64.AppImage" mail.msg
```

**macOS** — mount the `.dmg` and drag the app to Applications (macOS 12+,
universal binary).

> **Unsigned app:** MsgEater is free (GPL) and is neither signed nor notarized
> by Apple (the Developer Program costs USD 99/year). macOS will block it the
> first time with an unidentified-developer warning. To open it:
>
> - **Option A:** right-click the app → **Open** → confirm **Open** in the
>   dialog. Only needed the first time.
> - **Option B (Terminal):** remove the quarantine attribute and open it
>   normally:
>
>   ```bash
>   xattr -dr com.apple.quarantine "/Applications/MsgEater.app"
>   ```
>
> This is **not inherently harmless**: `xattr -dr com.apple.quarantine`
> disables part of Gatekeeper's normal flow for that app, and only makes sense
> as a workaround while there is no real signing/notarization. The code is open
> and auditable, and you can verify the binary with the steps above before
> applying it — but that is the accurate statement, not "it doesn't compromise
> security". This note will be removed once signing and notarization exist
> (see [Security & Trust](#security--trust)).

## Security & Trust

> Security should be verifiable, not assumed.

MsgEater is built to open potentially hostile email, so the chain from source
code to the binary you run is designed so a third party can check it — not so
you take the author's word for it:

| Control | What it provides |
| --- | --- |
| **Open source (GPL-3.0)** | All code, including build and CI, is auditable |
| **100% offline, no telemetry** | Network blocking at the session layer (NFR-03), covered by an e2e test |
| **CI on every commit** | Lint, typecheck, unit and e2e tests, `npm audit` for production deps |
| **[CodeQL](https://github.com/oscarhenriquezg/msgeater/security/code-scanning)** | GitHub's official static analysis (SAST) over the TS/JS code |
| **Dependabot + Dependency Review** | Dependencies watched both once installed and when a PR adds a new one |
| **[OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/oscarhenriquezg/msgeater)** | Independent assessment of the repository's security practices |
| **[OpenSSF Best Practices](https://www.bestpractices.dev/projects/14357)** | *Passing* badge: meets the OpenSSF set of good development practices (process, testing, vulnerability reporting, documentation) |
| **SHA-256 (`SHA256SUMS`)** | Every release lets you check the downloaded file is *byte for byte* the published one |
| **SBOM (SPDX)** | Signed inventory of what each release depends on, with versions |
| **GitHub Artifact Attestations** | Cryptographic proof (Sigstore) that the binary came from this repo and this commit — not from a third party |
| **VirusTotal scan** | **0 malicious / 0 suspicious** out of 75 engines on v0.5.0 (latest scanned version) — [see report](https://www.virustotal.com/gui/file/badf4388d46083e4c39d7cdb0568d3a6de7c1f878d29e733e6237f8a89aca724) · [all 5 installers + how to check it yourself](docs/VERIFY-RELEASE.md) |

None of these controls on its own — not even all of them together — means
"100% secure"; each one demonstrates something specific and verifiable. What
each one proves is detailed in
**[docs/VERIFY-RELEASE.md](docs/VERIFY-RELEASE.md)**, and the runtime
protection model (sandbox, sanitization, network blocking) is in
**[SECURITY.en.md](SECURITY.en.md)**.

## Known limitations (by design)

| | |
|---|---|
| Approximate RTF→HTML | If the message only carries pure RTF (no native or encapsulated HTML), the conversion is an approximation. |
| Reconstructed EML | The EML is generated from MAPI properties; it is not byte-equivalent to the original SMTP message. |
| Remote images | Blocked by default (placeholder); loadable with one click after a tracking warning. Embedded ones are displayed. |
| PNG ≤ 20,000 px | For longer emails, the app offers to truncate or suggests PDF instead. |
| Unsupported types | Calendar invites, contacts and tasks are reported as unsupported; encrypted S/MIME cannot be displayed; signatures are flagged but not verified. |

## Usage

Full external-interface reference — command-line invocation, accepted inputs,
every action and keyboard shortcut, and the output schema of each export
format — is in **[docs/USER-GUIDE.md](docs/USER-GUIDE.md)**.

## Development

```bash
npm install
npm run fixtures      # generates the synthetic .msg test corpus
npm run dev           # start with hot reload
npm test              # unit tests (parser, EML, adversarial corpus)
npm run test:coverage # unit tests with a coverage report
npm run build && npx playwright test   # E2E over the built app
npm run build:linux   # AppImage/deb/rpm into release/
npm run build:mac     # dmg/zip (requires macOS)
```

To test with real email, copy `.msg` files into `tests/fixtures/real/`
(a git-ignored directory): the suite picks them up automatically and
`npx vite-node scripts/report-real.ts` produces a parsing report.

### Architecture

Electron + TypeScript. Parsing (`@kenjiuno/msgreader` behind a custom adapter)
happens in a worker thread of the main process; the renderer receives a
serialized document with already-sanitized HTML and displays the body in a
sandboxed iframe with no script execution. Network blocking, native dialogs and
disk writes live exclusively in main. Full specification (in Spanish) in
[SRS-visor-msg-v0.2.md](SRS-visor-msg-v0.2.md).

## Contributing

Contributions are welcome, in English or Spanish. **Bugs and feature requests**
go to [Issues](https://github.com/oscarhenriquezg/msgeater/issues); **security
vulnerabilities do not** — those follow the private procedure in
[SECURITY.en.md](SECURITY.en.md).

Before opening a pull request, read **[CONTRIBUTING.md](CONTRIBUTING.md)**: it
covers the flow (fork → branch → PR against `main`, which is protected and
requires checks to pass), the lint/typecheck/test requirements, and the policy
that every functional change comes with its tests.

## License

© 2026 Oscar Henríquez. Released under the **GNU General Public License v3.0
(or later)**. Full text in [LICENSE.md](LICENSE.md).

Security policy and vulnerability reporting: [SECURITY.en.md](SECURITY.en.md).

### Third-party software

MsgEater uses the following open-source libraries. All of their licenses are
GPL-3.0 compatible. Each keeps its original license and copyright.

| Dependency | Use | License |
| --- | --- | --- |
| [Electron](https://github.com/electron/electron) | Desktop runtime | MIT |
| [@kenjiuno/msgreader](https://github.com/HiraokaHyperTools/msgreader) | Reading `.msg` files (CFBF/MAPI) | Apache-2.0 |
| [@kenjiuno/decompressrtf](https://github.com/HiraokaHyperTools/decompressRTF) | Decompressing compressed RTF | BSD-2-Clause |
| [rtf-stream-parser](https://github.com/mazira/rtf-stream-parser) | HTML/RTF de-encapsulation | MIT |
| [mailparser](https://github.com/nodemailer/mailparser) | Reading `.eml`/`.emlx` files (MIME) | MIT |
| [DOMPurify](https://github.com/cure53/DOMPurify) | Sanitizing the email's HTML | MPL-2.0 OR Apache-2.0 |
| [jsdom](https://github.com/jsdom/jsdom) | DOM for DOMPurify in the main process | MIT |
| [iconv-lite](https://github.com/ashtuchkin/iconv-lite) | Decoding legacy character sets | MIT |
| [archiver](https://github.com/archiverjs/node-archiver) | Generating ZIP exports | MIT |
| [Lucide](https://lucide.dev) (`lucide-static`) | UI icons (inlined at build time) | ISC |

> The complete license list for the whole dependency chain — including dev
> dependencies — can be generated with `npx license-checker --production`.
