export function normalizeAwb(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[\u0000-\u001f\u007f-\u009f\s]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

export function isValidAwb(value: unknown) {
  const awb = normalizeAwb(value);

  if (!/^[A-Z0-9]{8,24}$/.test(awb)) {
    return false;
  }

  return !/^0+$/.test(awb);
}
