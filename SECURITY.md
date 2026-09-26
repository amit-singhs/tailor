# Security

## Reporting a vulnerability

Please open a private security advisory on GitHub (Security tab, "Report a vulnerability") rather than a public issue. Include steps to reproduce. We aim to respond within 7 days.

## What Tailor protects

Your TypeSafe API key, and to a lesser degree your resumes.

## How the key is protected

| Stage | Protection |
|---|---|
| At rest | Sealed with AES-256-GCM. Key derived from your passphrase with PBKDF2-SHA256, 600,000 iterations, random 16-byte salt, random 12-byte IV. Only the sealed form is written to `storage.local`. Code: `lib/vault/crypto.ts`. |
| Unlocked | Held in the background worker's memory and in `storage.session`, which lives in memory, is cleared when the browser closes, and is restricted to trusted extension contexts (content scripts cannot read it). |
| In use | Only the background worker reads the key, to call `https://api.typesafe.ai` through the official SDK. The side panel never receives it; it sends work and gets results back. |
| Auto-lock | After a configurable idle period (default 30 minutes), via `chrome.alarms`, or when the browser closes. |
| Guessing | After 5 wrong passphrases, unlocking pauses for 30 seconds. |
| Messaging | The background only answers messages whose sender URL is one of this extension's own pages. Pages and content scripts are refused. |
| Network | The production content security policy allows connections only to the extension itself and `https://api.typesafe.ai`. |
| Page access | No persistent content scripts. The page reader is injected only when you click Measure, using `activeTab`; broader access is an optional permission you grant explicitly. |

## Threat model

Tailor defends against: web pages and other sites reading your key; casual access to the browser profile on disk (the key is encrypted); someone using your unlocked browser after the idle timeout.

Tailor cannot defend against: malware on your computer, a compromised browser, a malicious extension with broad permissions that can inspect other extensions, or someone who knows your passphrase. A weak passphrase can be brute-forced offline from a copy of your profile; use a long one.

## Recommendations

- Create a key dedicated to Tailor, and set a spending limit in the TypeSafe console.
- Revoke the key in the console if you think it leaked, then use **Settings > Replace key**.
