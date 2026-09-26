# Privacy policy

Tailor is a browser extension with no server. Its authors receive none of your data.

## What Tailor stores, on your computer only

- The resumes you add (their text and your skill lists), in the extension's IndexedDB.
- Jev's answers for jobs you measure (scores and probabilities, keyed by a hash of the text), so re-measuring is instant and free.
- Your TypeSafe API key, encrypted with your passphrase.
- Settings: model name, auto-lock time, which resume is selected.

Uninstalling Tailor deletes all of it. **Settings > Delete everything** does the same without uninstalling.

## What Tailor sends, and to whom

Only to TypeSafe AI (`api.typesafe.ai`), and only when you act:

- **Adding a resume:** the resume text and a list of candidate skill names, so Jev can confirm which skills are yours.
- **Measuring a job:** the job description text, the resume text, and skill names.

The request is authenticated with your own API key. TypeSafe's handling of that data is governed by TypeSafe's terms and privacy policy, which you accepted when you created the key.

## What Tailor reads from web pages

Nothing, until you click **Measure this job**. Then it reads the text of that one page (or your selection) to find the job description. It doesn't read pages in the background, track browsing, or collect analytics.

## Permissions

| Permission | Why |
|---|---|
| `activeTab`, `scripting` | Read the current job page when you click Measure |
| `storage` | Save settings and the encrypted key |
| `alarms` | Auto-lock the key |
| `sidePanel` | Show Tailor beside the page |
| `https://api.typesafe.ai/*` | Call Jev |
| Optional: all sites | Only if you choose "Allow on job sites", so Measure works without clicking the toolbar icon first |
