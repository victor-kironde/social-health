/**
 * PBKDF2-HMAC-SHA256 known answer, computed with Node's crypto.pbkdf2Sync.
 * Checked in unit tests (pure JS) and on the device (native) by kdfSelfTest().
 */
export const KDF_SELF_TEST = {
  password: 'social-graph-self-test',
  salt: 'fixed-salt-0123456789',
  iterations: 1000,
  expectedHex: '3ad17534745953d4e22c7c9e618d6ab4d01d338e036261b7ec7c53bdcec3282c',
};
