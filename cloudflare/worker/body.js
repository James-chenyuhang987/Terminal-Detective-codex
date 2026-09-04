function payloadTooLarge(code) {
  return Object.assign(new Error(code), { code, status: 413 });
}

export async function readBodyBytes(request, maxBytes, errorCode = 'PAYLOAD_TOO_LARGE') {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw payloadTooLarge(errorCode);
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel('Request body exceeds the configured limit.');
        } catch {
          // The size error remains authoritative even if stream cleanup fails.
        }
        throw payloadTooLarge(errorCode);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readBodyText(request, maxBytes, errorCode = 'PAYLOAD_TOO_LARGE') {
  return new TextDecoder().decode(await readBodyBytes(request, maxBytes, errorCode));
}
