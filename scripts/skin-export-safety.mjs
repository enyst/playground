/**
 * Credential handling for skin configuration exports and changed-file pushes.
 *
 * These checks cover structured credential fields and recognizable literals.
 * They cannot certify arbitrary prose, source code or archive contents. Those
 * files require review before a manual push and never qualify for auto-push.
 * Reports contain paths and reasons, never the rejected credential values.
 */
import yaml from "js-yaml";
import { gunzipSync } from "node:zlib";

/** @typedef {{rejectedPaths?: string[], opaquePaths?: string[]}} ExportSafetyOptions */
/** @typedef {{safeForAutomaticPush: boolean, rejectedPaths: string[], opaquePaths: string[], warnings: string[]}} ExportSafetyReport */

// Automation uploads are limited to 1 MiB compressed by the released API. Bound
// expansion too: archive checks must not turn a small upload into a memory bomb.
const MAX_ARCHIVE_SCAN_BYTES = 16 * 1024 * 1024;

function normalizedKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.\s]/g, "_")
    .toLowerCase();
}

function isCredentialKey(key) {
  const name = normalizedKey(key);
  return (
    /(?:^|_)(?:api_?key|access_key(?:_id)?|token|password|passwd|secret|credentials?|private_key|session_key|authorization|cookie)$/.test(
      name,
    ) ||
    ["set_cookie", "proxy_authorization", "oauth_tokens", "tokens"].includes(
      name,
    )
  );
}

function isCredentialQuery(key) {
  return (
    isCredentialKey(key) ||
    /^(?:key|sig|signature|auth|x_amz_signature|x_amz_credential|x_amz_security_token|x_goog_signature|x_goog_credential|googleaccessid)$/i.test(
      normalizedKey(key),
    )
  );
}

// Preserve only references without literal fallback values. A placeholder with
// ${TOKEN:-literal-password} carries credential material despite its syntax.
function isSecretReference(value) {
  return /^(?:(?:Bearer|Basic)\s+)?(?:\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\})(?::(?:\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}))?$/i.test(
    value,
  );
}

function hasKnownCredentialLiteral(value) {
  return (
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{12,}|sk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/.test(
      value,
    ) ||
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(value) ||
    /\bgAAAAA[A-Za-z0-9_-]{30,}={0,2}\b/.test(value)
  );
}

function isMaskedOrEncrypted(value) {
  return (
    /^\*{4,}$/.test(value.trim()) ||
    value === "<secret-hidden>" ||
    /^gAAAAA[A-Za-z0-9_-]{30,}={0,2}$/.test(value)
  );
}

function childPath(path, key) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

function sanitizeUrl(value, path, reject) {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  let url;
  try {
    url = new URL(value);
  } catch {
    // A malformed credential-bearing URL must not bypass parsing checks.
    if (
      /:\/\/[^/\s]*@/.test(value) ||
      /[?&#](?:token|api[_-]?key|password|signature)=/i.test(value)
    ) {
      reject(path);
      return undefined;
    }
    return value;
  }
  let changed = false;
  if (url.username || url.password) {
    reject(`${path}.userinfo`);
    url.username = "";
    url.password = "";
    changed = true;
  }
  for (const [key, entry] of [...url.searchParams]) {
    if (isCredentialQuery(key) && entry && !isSecretReference(entry)) {
      reject(`${path}.query.${key}`);
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (url.hash.includes("=")) {
    const fragment = new URLSearchParams(url.hash.slice(1));
    let fragmentChanged = false;
    for (const [key, entry] of [...fragment]) {
      if (isCredentialQuery(key) && entry && !isSecretReference(entry)) {
        reject(`${path}.fragment.${key}`);
        fragment.delete(key);
        fragmentChanged = true;
      }
    }
    if (fragmentChanged) {
      url.hash = fragment.toString();
      changed = true;
    }
  }
  return changed ? url.toString() : value;
}

function hasCredentialCommand(value) {
  // Literal assignments and argv flags are recognizable. Other shell/source
  // syntax remains opaque, rather than being advertised as sanitized code.
  const assignments = value.matchAll(
    /\b([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g,
  );
  for (const match of assignments) {
    // These are source expressions, not literal credential values. The file
    // remains opaque and requires review; never evaluate the expression.
    const expression = match[4];
    if (expression && /^\(?[A-Za-z_$][\w$]*(?:\??\.|\[|\()/.test(expression))
      continue;
    if (
      isCredentialKey(match[1]) &&
      !isSecretReference(match[2] ?? match[3] ?? match[4])
    )
      return true;
  }
  const flags = value.matchAll(
    /--([A-Za-z][A-Za-z0-9_-]*)(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s]+))/g,
  );
  for (const match of flags) {
    if (
      isCredentialKey(match[1]) &&
      !isSecretReference(match[2] ?? match[3] ?? match[4])
    )
      return true;
  }
  return false;
}

/** Strip structured credential values while preserving names and SDK refs. */
export function sanitizeExportData(value, { path = "$" } = {}) {
  const rejectedPaths = [];
  const reject = (entry) => {
    if (!rejectedPaths.includes(entry)) rejectedPaths.push(entry);
  };

  const walk = (current, currentPath, context = {}) => {
    if (typeof current === "string") {
      if (isMaskedOrEncrypted(current) || hasKnownCredentialLiteral(current)) {
        reject(currentPath);
        return undefined;
      }
      if (context.credential && current && !isSecretReference(current)) {
        reject(currentPath);
        return undefined;
      }
      if (
        /^(?:Bearer|Basic)\s+\S+$/i.test(current.trim()) &&
        !isSecretReference(current)
      ) {
        reject(currentPath);
        return undefined;
      }
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(current)) {
        return sanitizeUrl(current, currentPath, reject);
      }
      if (hasCredentialText(current)) {
        reject(currentPath);
        return undefined;
      }
      return current;
    }
    if (Array.isArray(current)) {
      if (context.args) return sanitizeArgs(current, currentPath);
      return current.flatMap((entry, index) => {
        const sanitized = walk(entry, `${currentPath}[${index}]`, context);
        return sanitized === undefined ? [] : [sanitized];
      });
    }
    if (!current || typeof current !== "object") {
      if (context.credential && current !== null && current !== undefined) {
        reject(currentPath);
        return undefined;
      }
      return current;
    }
    if (
      context.credential &&
      current.kind !== "LookupSecret" &&
      current.kind !== "StaticSecret"
    ) {
      reject(currentPath);
      return undefined;
    }
    const out = Object.create(null);
    for (const [key, entry] of Object.entries(current)) {
      if (entry === undefined) continue;
      const entryPath = childPath(currentPath, key);
      const normalized = normalizedKey(key);
      // Skin-owned binding metadata maps canonical credential fields to named
      // secrets; these are references, not the field's credential value.
      if (
        normalized === "secret_bindings" &&
        entry &&
        typeof entry === "object" &&
        !Array.isArray(entry)
      ) {
        out[key] = Object.create(null);
        for (const [field, name] of Object.entries(entry)) {
          if (
            typeof name === "string" &&
            /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
          ) {
            out[key][field] = name;
          } else {
            reject(childPath(entryPath, field));
          }
        }
        continue;
      }
      // Maps in agent_context.secrets use arbitrary names, so key matching is
      // insufficient. Keep the name as a StaticSecret requirement descriptor.
      if (
        normalized === "secrets" &&
        entry &&
        !Array.isArray(entry) &&
        typeof entry === "object"
      ) {
        out[key] = Object.create(null);
        for (const [name, secret] of Object.entries(entry)) {
          const secretPath = childPath(entryPath, name);
          if (
            secret?.kind === "LookupSecret" ||
            secret?.kind === "StaticSecret"
          ) {
            out[key][name] = walk(secret, secretPath);
          } else {
            if (secret !== null && secret !== undefined && secret !== "")
              reject(secretPath);
            out[key][name] = { kind: "StaticSecret" };
          }
        }
        continue;
      }
      const secretValue =
        normalized === "value" &&
        (current.kind === "StaticSecret" ||
          ["api_key", "bearer"].includes(current.strategy));
      const basicUser =
        normalized === "username" && current.strategy === "basic";
      const sanitized = walk(entry, entryPath, {
        credential:
          isCredentialKey(key) ||
          secretValue ||
          basicUser ||
          (normalized === "auth" && typeof entry === "string"),
        args: normalized === "args" || normalized === "argv",
      });
      if (sanitized !== undefined) out[key] = sanitized;
    }
    return out;
  };

  const sanitizeArgs = (args, currentPath) => {
    const out = [];
    for (let index = 0; index < args.length; index++) {
      const argument = args[index];
      const argumentPath = `${currentPath}[${index}]`;
      if (typeof argument === "string") {
        const flag = /^--([A-Za-z][A-Za-z0-9_-]*)(?:=(.*))?$/.exec(argument);
        if (flag && isCredentialKey(flag[1])) {
          const next = flag[2] ?? args[index + 1];
          if (typeof next === "string" && isSecretReference(next)) {
            out.push(argument);
            if (flag[2] === undefined) out.push(args[++index]);
          } else {
            reject(
              flag[2] === undefined
                ? `${currentPath}[${index + 1}]`
                : argumentPath,
            );
            if (
              flag[2] === undefined &&
              index + 1 < args.length &&
              !String(next).startsWith("--")
            )
              index++;
          }
          continue;
        }
      }
      const sanitized = walk(argument, argumentPath);
      if (sanitized !== undefined) out.push(sanitized);
    }
    return out;
  };

  const sanitized = walk(value, path);
  return {
    value: sanitized,
    rejectedPaths,
    warnings: rejectedPaths.map(
      (entry) =>
        `Credential material omitted at ${entry}; configure a named secret reference instead.`,
    ),
  };
}

/**
 * Opaque source/archive contents always require human review before push.
 * @param {ExportSafetyOptions} options
 * @returns {ExportSafetyReport}
 */
export function assessExportSafety({
  rejectedPaths = [],
  opaquePaths = [],
} = {}) {
  return {
    safeForAutomaticPush:
      rejectedPaths.length === 0 && opaquePaths.length === 0,
    rejectedPaths: [...new Set(rejectedPaths)],
    opaquePaths: [...new Set(opaquePaths)],
    warnings: [
      ...rejectedPaths.map(
        (path) => `Credential material detected at ${path}.`,
      ),
      ...opaquePaths.map(
        (path) =>
          `Review required for ${path}; arbitrary source and archive contents cannot be certified credential-free.`,
      ),
    ],
  };
}

function hasCredentialText(text) {
  if (hasKnownCredentialLiteral(text) || hasCredentialCommand(text))
    return true;
  // Check quoted configuration/source literals without evaluating any code.
  for (const match of text.matchAll(
    /(?:["']?)([A-Za-z_][A-Za-z0-9_.-]*)(?:["']?)\s*[:=]\s*["']([^"'\r\n]+)["']/g,
  )) {
    if (isCredentialKey(match[1]) && !isSecretReference(match[2])) return true;
  }
  if (/(?:https?|s3|gs):\/\/[^\s/"']+@/i.test(text)) return true;
  for (const match of text.matchAll(
    /[?&#]([A-Za-z_][A-Za-z0-9_.-]*)=([^\s&#"']+)/g,
  )) {
    if (isCredentialQuery(match[1]) && !isSecretReference(match[2]))
      return true;
  }
  for (const match of text.matchAll(
    /(?:Authorization|Proxy-Authorization)\s*[:=]\s*["']?(?:Bearer|Basic)\s+([^\s"']+)/gi,
  )) {
    if (!isSecretReference(match[1])) return true;
  }
  return false;
}

function opaqueMetadataPaths(value, path) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value))
    return value.flatMap((entry, index) =>
      opaqueMetadataPaths(entry, `${path}[${index}]`),
    );
  return Object.entries(value).flatMap(([key, entry]) => {
    const entryPath = childPath(path, key);
    if (
      entry &&
      (/(?:^|_)(?:prompt|code|script)$/.test(normalizedKey(key)) ||
        [
          "preset_metadata",
          "metadata",
          "system_message",
          "conversation_instructions",
        ].includes(normalizedKey(key)))
    ) {
      return [entryPath];
    }
    return opaqueMetadataPaths(entry, entryPath);
  });
}

/**
 * Inspect only files changed by the proposed push (including local commits).
 * `null` content denotes a deletion. Callers must read files without following
 * links outside the checkout. This function does not stage or rewrite files.
 * @param {Array<{path: string, content: string | Buffer | null | undefined}>} files
 * @returns {ExportSafetyReport}
 */
export function inspectSkinFilesForPush(files) {
  const rejectedPaths = [];
  const opaquePaths = [];
  for (const { path, content } of files) {
    if (content === null || content === undefined) continue;
    const text =
      typeof content === "string" ? content : content.toString("utf8");
    if (
      /(?:^|\/)(?:\.env(?:\..*)?|id_(?:rsa|ed25519|ecdsa)|credentials)(?:$|\/)|\.(?:pem|p12|pfx|key)$/i.test(
        path,
      )
    ) {
      rejectedPaths.push(path);
      continue;
    }
    if (/\.(?:tar\.gz|tgz)$/i.test(path)) {
      opaquePaths.push(path);
      try {
        const bytes =
          typeof content === "string" ? Buffer.from(content) : content;
        // Scan uncompressed member bytes without interpreting paths or
        // extracting files. A clean scan still requires review of the source.
        const expanded = gunzipSync(bytes, {
          maxOutputLength: MAX_ARCHIVE_SCAN_BYTES,
        });
        if (hasCredentialText(expanded.toString("utf8")))
          rejectedPaths.push(path);
      } catch {
        // An unreadable/oversized archive cannot bypass known-credential
        // checking through a manual review acknowledgment.
        rejectedPaths.push(path);
      }
      continue;
    }
    if (/\.(?:json|ya?ml)$/i.test(path)) {
      try {
        const data = /\.json$/i.test(path) ? JSON.parse(text) : yaml.load(text);
        const report = sanitizeExportData(data, { path });
        rejectedPaths.push(...report.rejectedPaths);
        opaquePaths.push(...opaqueMetadataPaths(data, path));
        // Only our exported configuration formats have a structured safety
        // contract. Other JSON/YAML may embed arbitrary source or private data.
        if (
          !/(?:^|\/)skin\.ya?ml$|^automations\/[^/]+\/automation\.json$/.test(
            path,
          )
        )
          opaquePaths.push(path);
      } catch {
        opaquePaths.push(path);
        if (hasCredentialText(text)) rejectedPaths.push(path);
      }
    } else {
      opaquePaths.push(path);
      if (hasCredentialText(text)) rejectedPaths.push(path);
    }
  }
  return assessExportSafety({ rejectedPaths, opaquePaths });
}
