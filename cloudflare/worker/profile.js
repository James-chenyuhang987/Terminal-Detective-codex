export { handleProfileFunction, handleCurrentUser } from './profileAuthority.js';
import { validId, validRevision, parseObject, commandHash, MAX_PROFILE_BYTES } from './authorityStore.js';

export const profileInternals = Object.freeze({
  // Legacy patch callers always fail closed, even for previously writable fields.
  cleanPatch: () => null,
  validOperationId: validId,
  validSessionId: validId,
  validRevision,
  parseProfile: parseObject,
  patchHash: commandHash,
  MAX_PROFILE_BYTES,
});
