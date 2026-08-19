# Threat model

Social Graph records who matters to someone, how often they are in touch,
and private judgements about how those relationships are going. A leak could
expose family structure, friendships, work contacts and opinions about
named people who never agreed to be recorded. This document lists what we
protect, from whom, how, and what remains.

Scope: the Android prototype as built (no backend, no accounts, no sync).
Method: assets → actors → threats per entry point (STRIDE-style), each with
its mitigation and residual risk.

## Assets

| Asset | Where | Sensitivity |
|---|---|---|
| People (names) | `event` table | High: identifies third parties |
| Relationship ratings (importance, quality incl. "harmful", support) | `event` table | Very high: private judgements |
| Contact history (who, when, how, who else was there) | `event` table | High |
| Inferred ties between people | derived in memory, never stored | High |
| Graph layout cache | `graph_position`, `graph_meta` | Low: positions and ids, no names |
| Database key | Android Keystore-backed SecureStore | Critical: unlocks everything |
| Export files | user-chosen location, after sharing | As sensitive as all of the above |

## Actors

1. **Someone holding the unlocked phone** (partner, family member,
   colleague). The most likely attacker: physical access, short time,
   possibly coercive.
2. **Thief or finder of a locked phone.**
3. **Other apps on the phone,** including malware without root.
4. **Cloud backup / device transfer** silently copying app data.
5. **Recipients of an export file,** intended or not.
6. **The people recorded,** who may not know they are in someone's graph.
7. **Out of scope:** a rooted/compromised OS, forensic labs with
   hardware attacks, the developer (there is no server to compromise).

## Threats and mitigations

| # | Threat | Actor | Mitigation | Residual risk |
|---|---|---|---|---|
| T1 | Opening the app on an unlocked phone and reading ratings | 1 | **App lock on by default**, using the phone's own biometrics/PIN. Turning it off requires authenticating first. Optional immediate re-lock; otherwise 30 s grace. | Anyone who knows the phone PIN can unlock. Grace period trades safety for convenience (user choice). |
| T2 | Reading app data from storage of a stolen phone | 2, 3 | **SQLCipher-encrypted database**; random 256-bit key generated on device and held in Android Keystore-backed SecureStore; Android file-based encryption and app sandbox underneath. | A rooted phone with the app's process memory or Keystore access defeats this (out of scope). |
| T3 | Data copied off the phone by Auto Backup or device transfer | 4 | `android:allowBackup="false"` set from the start. | Manufacturer-specific transfer tools that ignore the flag. |
| T4 | Recent-apps thumbnail shows names | 1 | With immediate re-lock, the lock screen is drawn on leaving the app. | Without immediate re-lock the thumbnail may show content. FLAG_SECURE (blocks thumbnails and screenshots) is future work: it also blocks legitimate screenshots. |
| T5 | Export file read by whoever gets it | 5 | **Encrypted export by default**: AES-256-GCM, key from PBKDF2-HMAC-SHA256 (random 16-byte salt, iterations below), header bound as associated data; password of at least 10 characters, rejected if trivially predictable (fewer than 5 distinct characters, or a simple run like 1234567890), entered twice. Unencrypted export only behind an explicit warning. | Weak passwords can be guessed offline; PBKDF2 slows but does not prevent this. The file leaves the app's control once shared. |
| T6 | Tampering with an export (e.g. lowering its iteration count) | 5 | GCM authentication over data and header: any change fails decryption. | — |
| T7 | Export left behind in the app's cache | 2, 3 | Previous export files are deleted each time Settings opens and before each new export. | An export stays in the private cache until then (encrypted unless the user chose otherwise). |
| T8 | Deleted records recoverable from the database file | 2 | Person deletion rewrites shared contacts and deletes the rest; `PRAGMA secure_delete = ON` overwrites freed space. **Delete all** removes the database file and then the key (crypto-shredding: any remnant is unreadable without it). | Flash wear-levelling may keep old encrypted blocks, which stay unreadable without the deleted key. |
| T9 | Recorded people's interests | 6 | Data never leaves the phone unless the user exports it; only the user sees it; ties are inferred only from contacts the user logged, never collected from others; erasure removes a person completely. | The user is processing others' personal data. Local, personal use falls under the GDPR household exemption; any future sync or sharing would not. |
| T11 | Contacts access exposing the user's whole address book | 3, 6 | Permission is requested only when the user chooses to import, never at start-up. Only the display-name field is read (no numbers, emails, photos or contact ids); nobody is pre-selected; only ticked names are stored, in the encrypted database. Duplicates of people already added are blocked. | While granted, the OS lets the app read contacts; the user can revoke it in system settings. Google Play requires a declared reason for READ_CONTACTS. |
| T10 | Over-reliance on the score or graph causing distress | user | Descriptive (never prescriptive) wording, no streaks or leaderboards, gentler wording for new users, harmful relationships excluded from the score, "in memoriam" state. | The score can still feel judgemental; ethics review and user testing needed. |

## Design decision: app lock gates the screen, not the key

Android can store a key that only becomes usable after biometric
authentication (`setUserAuthenticationRequired`). Tying the database key to
it would make the app lock cryptographic. It was rejected because Android
**permanently invalidates such keys when a new fingerprint is enrolled or
biometrics are reset**, which would make all of the user's data
unrecoverable with no warning. For a personal diary-like app, that failure
mode is worse than the attack it prevents (T2 is already covered by
SQLCipher plus the OS sandbox). The lock therefore protects against T1, and
encryption against T2.

## Verification on the device

- App lock, cancel → lock screen, 30 s grace re-lock, and authentication
  before turning the lock off were checked by hand on the target phone
  (release build). The system biometric prompt is a secure window, so
  screenshots of it come out black.
- An export made on the phone (Hermes) was decrypted on a laptop (Node)
  with the same code: the payload was intact (format, schema and model
  versions, all events), and a password one character off was rejected.
  The file contained none of the plaintext names.

## Export key derivation cost

PBKDF2 iterations trade export time against resistance to offline password
guessing. The first implementation was pure JavaScript (@noble/hashes):
under Hermes, which has no JIT, 310,000 iterations took **81.5 s** on the
target phone, which is unusable. Key derivation now runs natively (OpenSSL
through react-native-quick-crypto) at OWASP's recommended 600,000
iterations; the pure-JS version remains for tests and other platforms. Both
produce identical keys (checked against a Node-computed known answer in unit
tests and on the device via Engine preview → Export encryption check), so
files are interchangeable, and the iteration count stored in each file keeps
older exports readable.

| Implementation | Iterations | Time on phone (release build) |
|---|---|---|
| Pure JS (Hermes) | 310,000 | 81.5 s |
| Native (OpenSSL) | 600,000 | _see device check_ |

## Not yet addressed

- FLAG_SECURE (screenshot and thumbnail blocking) as an option.
- Optional neutral app name and icon (discreet mode).
- Importing an export (the format is versioned and decryption is
  implemented and tested, but there is no import screen yet).
- Any backend: none exists. If sync or reciprocal connections are added,
  this model must be extended (transport, server storage, pseudonymous ids,
  account takeover).
