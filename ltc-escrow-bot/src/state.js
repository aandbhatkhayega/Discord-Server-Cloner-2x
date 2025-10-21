// Simple in-memory state for tickets and escrows. In production, swap with DB.
const tickets = new Map(); // channelId -> { id, sellerId, buyerId, amountLtc, status, depositAddress, txid, payoutAddress }

function createTicket(channelId) {
  const t = {
    channelId,
    sellerId: null,
    buyerId: null,
    amountLtc: null,
    status: 'open', // open -> awaiting_parties -> awaiting_amount -> awaiting_deposit -> deposited -> released | cancelled
    depositAddress: null,
    txid: null,
    payoutAddress: null,
    createdAt: Date.now(),
    history: [],
  };
  tickets.set(channelId, t);
  return t;
}

function getTicket(channelId) {
  return tickets.get(channelId) || null;
}

function updateTicket(channelId, changes) {
  const existing = tickets.get(channelId);
  if (!existing) return null;
  const updated = { ...existing, ...changes };
  tickets.set(channelId, updated);
  return updated;
}

function addHistory(channelId, entry) {
  const t = tickets.get(channelId);
  if (!t) return;
  t.history.push({ time: Date.now(), ...entry });
}

module.exports = { createTicket, getTicket, updateTicket, addHistory };
