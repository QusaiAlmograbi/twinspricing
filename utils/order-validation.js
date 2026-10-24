"use strict";

function normalizePositiveId(value) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return String(value);
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  return value;
}

function normalizeIntegerPosition(value) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function validateOrderPayload(expected, order) {
  if (!Array.isArray(expected) || !Array.isArray(order) || expected.length !== order.length) {
    return { error: "expected و order يجب أن يكون لهما نفس الطول" };
  }

  const expectedIds = [];
  for (const entry of expected) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { error: "expected يحتوي على بند غير صالح" };
    }
    const id = normalizePositiveId(entry.id);
    const sortOrder = normalizeIntegerPosition(entry.sort_order);
    if (!id || sortOrder === null) return { error: "المعرفات والمواقع يجب أن تكون صحيحة" };
    expectedIds.push(id);
  }

  const orderIds = [];
  for (const value of order) {
    const id = normalizePositiveId(value && typeof value === "object" ? value.id : value);
    if (!id) return { error: "المعرفات يجب أن تكون أعداداً صحيحة موجبة" };
    orderIds.push(id);
  }

  const expectedSet = new Set(expectedIds);
  const orderSet = new Set(orderIds);
  if (expectedSet.size !== expectedIds.length || orderSet.size !== orderIds.length) {
    return { error: "معرفات مكررة غير مسموحة" };
  }
  if (expectedSet.size !== orderSet.size || [...expectedSet].some((id) => !orderSet.has(id))) {
    return { error: "expected و order يجب أن يحتويا على نفس المعرفات" };
  }

  return { expectedIds, orderIds };
}

module.exports = { normalizePositiveId, validateOrderPayload };
