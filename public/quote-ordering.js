(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.QuoteOrdering = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function sectionLabel(index) {
    if (index < 0) return "";
    let n = index;
    let result = "";
    do {
      const ch = String.fromCharCode(65 + (n % 26));
      result = ch + result;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return result;
  }

  function compareBySortOrderThenId(a, b) {
    const sa = a.sort_order ?? 0;
    const sb = b.sort_order ?? 0;
    if (sa !== sb) return sa - sb;
    const ida = a.id ?? 0;
    const idb = b.id ?? 0;
    if (ida !== idb) return ida - idb;
    return 0;
  }

  function resolveScopeOrder(items) {
    return [...items].sort(compareBySortOrderThenId);
  }

  function buildGroupEnumeration(section) {
    const allItems = section.items || [];
    const rooms = section.rooms || [];
    const hasRooms = section.has_rooms;

    const directItems = allItems.filter((it) => !it.room_id);
    const roomItemsByRoom = new Map();
    for (const room of rooms) {
      const nestedItems = room.items || [];
      const flatItems = allItems.filter((it) => Number(it.room_id) === Number(room.id));
      roomItemsByRoom.set(room.id, nestedItems.length ? nestedItems : flatItems);
    }

    const groups = [];

    if (hasRooms) {
      const sortedDirect = resolveScopeOrder(directItems);
      if (sortedDirect.length > 0) {
        groups.push({ kind: "direct", groupNumber: 1, items: sortedDirect, roomId: null });
      } else {
        // Reserve group 1 even when empty
        groups.push({ kind: "direct", groupNumber: 1, items: [], roomId: null });
      }
      const sortedRooms = resolveScopeOrder(rooms);
      for (let i = 0; i < sortedRooms.length; i++) {
        const room = sortedRooms[i];
        const items = resolveScopeOrder(roomItemsByRoom.get(room.id) || []);
        groups.push({ kind: "room", groupNumber: i + 2, items: items, roomId: room.id, roomName: room.name });
      }
    } else {
      const sortedItems = resolveScopeOrder(allItems);
      if (sortedItems.length > 0) {
        groups.push({ kind: "direct", groupNumber: 1, items: sortedItems, roomId: null });
      }
    }

    return groups;
  }

  function buildDisplayCodeMap(section) {
    const map = new Map();
    const sectionPrefix = sectionLabel(section._resolvedIndex ?? 0);
    const groups = buildGroupEnumeration(section);

    for (const group of groups) {
      for (let i = 0; i < group.items.length; i++) {
        const item = group.items[i];
        const seq = i + 1;
        map.set(item, `${sectionPrefix} ${group.groupNumber}.${seq}`);
      }
    }
    return map;
  }

  function linkRoomItemInstances(section) {
    const flatItems = section.items || [];
    const nestedItems = (section.rooms || []).flatMap((room) => room.items || []);
    const nestedById = new Map(
      nestedItems
        .filter((item) => item.id != null)
        .map((item) => [String(item.id), item]),
    );
    const linked = flatItems.map((item) =>
      item.id != null && nestedById.has(String(item.id))
        ? nestedById.get(String(item.id))
        : item,
    );
    const linkedSet = new Set(linked);
    for (const item of nestedItems) {
      if (!linkedSet.has(item)) {
        linked.push(item);
        linkedSet.add(item);
      }
    }
    section.items = linked;
    return section;
  }

  function itemWriterPayload(item) {
    const {
      id: _id,
      sort_order: _sortOrder,
      _fromServer,
      _saveFailed,
      ...payload
    } = item;
    return {
      ...payload,
      category_id: item.category_id || null,
      room_id: item.room_id || null,
    };
  }

  function resolveQuoteHierarchy(quoteData) {
    const sections = resolveScopeOrder(quoteData.sections || []);
    for (let i = 0; i < sections.length; i++) {
      sections[i]._resolvedIndex = i;
    }
    return sections;
  }

  function resolveAllDisplayCodes(quoteData) {
    const sections = resolveQuoteHierarchy(quoteData);
    const allCodes = new Map();
    for (const sec of sections) {
      const map = buildDisplayCodeMap(sec);
      for (const [item, code] of map) allCodes.set(item, code);
    }
    return { sections, allCodes };
  }

  function getItemDisplayCode(item, sectionPrefix, groupNumber, itemSequence) {
    return `${sectionPrefix} ${groupNumber}.${itemSequence}`;
  }

  return {
    sectionLabel,
    compareBySortOrderThenId,
    resolveScopeOrder,
    buildGroupEnumeration,
    buildDisplayCodeMap,
    linkRoomItemInstances,
    itemWriterPayload,
    resolveQuoteHierarchy,
    resolveAllDisplayCodes,
    getItemDisplayCode,
  };
});