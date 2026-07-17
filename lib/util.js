// lib/util.js
const { nanoid } = require('nanoid');

const newId = (prefix) => `${prefix}_${nanoid(12)}`;

// Higher number = more privilege. Used for "at least X role" checks.
const ROLE_RANK = { viewer: 1, editor: 2, manager: 3, admin: 4, owner: 5 };

function roleAtLeast(role, min) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 999);
}

module.exports = { newId, ROLE_RANK, roleAtLeast };
