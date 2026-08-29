# Security policy

<p align="center">
  <a href="SECURITY.md">Español</a> · <b>English</b>
</p>

MsgEater is a **100% offline** mail viewer whose purpose is to open
`.msg`/`.eml`/`.emlx` files — which may be hostile — without putting the user
at risk. Security is part of the point of this project, so vulnerability
reports are welcome and handled as a priority.

## Supported versions

Security support is provided only for the **latest published release** in
[Releases](https://github.com/oscarhenriquezg/msgeater/releases/latest).
Earlier versions do not receive patches: as free software from a single
maintainer, keeping several branches alive in parallel is not sustainable.
Update to the latest version before reporting if you can — the issue may
already be fixed.

## How to report a vulnerability

**Do not open a public issue** for security problems. Instead:

1. Preferred: use **GitHub Security Advisories** →
   [«Report a vulnerability»](https://github.com/oscarhenriquezg/msgeater/security/advisories/new).
2. Alternative: email **oscar.henriquez.gonzalez@gmail.com** with the subject
   `[SECURITY] msgeater`.

Please include, if you can:

- the app version and your operating system;
- steps to reproduce and a minimal **anonymized** test file (`.msg`/`.eml`),
  with no real personal or corporate data;
- the impact you believe it has.

### What to expect

- **Acknowledgement** within 72 hours.
- An initial assessment and, if applicable, a remediation plan within
  2 weeks at most.
- Credit in the release notes of the version that fixes it, if you want it.

As a non-profit personal project there is no bug bounty program.

### Coordinated disclosure

**Coordinated disclosure** is requested: please don't publish exploitation
details (issue, social media, mailing list) before a fix is released, or before
90 days have passed since acknowledgement with no response or progress from the
maintainer — whichever comes first. If you are credited, the timing and wording
are coordinated with you before publishing.

## Scope

Particularly relevant for this project:

- **Execution of email content**: any way to run scripts, load remote resources
  (IP leak / tracking pixels), or escape the inert environment of the message
  body.
- **Renderer sandbox escape** or improper access to Node APIs from the
  displayed content.
- **Writing files outside what the user chose** when saving attachments or
  exporting (path traversal via manipulated attachment names).
- **Exploitable crashes or corruption** when processing malformed files.

Out of scope: already-known third-party dependency vulnerabilities with no
available patch (report those upstream), and attacks that require the user to
voluntarily disable the app's protections.

## CVEs in dependencies

Dependencies are watched automatically, not only when someone reports
something:

- **Dependabot** (alerts + updates) reviews what is already installed weekly,
  grouped so it doesn't create unnecessary PR noise.
- **`npm audit --omit=dev --audit-level=high`** runs on every commit/PR (CI)
  and **blocks the build** on HIGH/CRITICAL vulnerabilities in dependencies
  that actually ship in the distributed binary (development tooling, which is
  not distributed, is excluded).
- **Dependency Review** blocks, in pull requests, the introduction of a new
  dependency with known HIGH/CRITICAL vulnerabilities before merging.

A CVE in a production dependency is treated with the same priority as a bug of
our own: if there is an upstream patch, it is applied and a fixed version is
released; if there isn't, mitigation is evaluated (pinning to a version without
the affected code, avoiding the vulnerable code path, or replacing the
dependency) based on the real impact on this app, not just the reported
severity.

## Security-oriented design decisions

- The email body is displayed in a *sandboxed* `<iframe>`
  (`allow-same-origin`, **without `allow-scripts` or `allow-popups`**) with a
  CSP that only allows `data:` for images.
- The HTML is **sanitized with DOMPurify** — the same shared policy
  (`@shared/sanitize-policy`) both in the renderer (native DOM, for what is
  displayed) and in the main process (for the source view and the exports) —
  and the viewer additionally shows a *diff* of what was removed.
- **Outbound network blocking** at the session layer: no resource from the
  message reaches the Internet unless the user explicitly asks to load a
  blocked remote image (NFR-03).
- Parsing happens in a *worker thread* isolated from the main process.
- An **Unlink** feature renders every link in a suspicious email inert, plus a
  trust warning before opening any external link.

These measures reduce risk, but none is perfect: that is why this document
exists. The full detail — trust boundaries, data-flow diagram and what residual
risk remains at each point — is in
[`docs/SECURITY-ARCHITECTURE.md`](docs/SECURITY-ARCHITECTURE.md). To verify
that a published release corresponds to this repository's code, see
[`docs/VERIFY-RELEASE.md`](docs/VERIFY-RELEASE.md).
