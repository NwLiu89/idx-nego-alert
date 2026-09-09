/**
 * Turning one nego deal into the Telegram message a human actually wants to read.
 *
 * Rendered with parse_mode=HTML, so every field that originates from the exchange feed
 * (stock and broker names) is escaped before it reaches the wire.
 */

const SITE = 'https://idx.indoalgo.com';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Indonesian convention: "." groups thousands, "," is the decimal mark. */
export const formatNumber = (n) => new Intl.NumberFormat('id-ID').format(n);

/** Rp 128.185.000.000 is unreadable at a glance; "Rp 128,19 bn" is not. */
export function formatIdrShort(value) {
  const [scale, suffix] = value >= 1e12 ? [1e12, 'tn'] : value >= 1e9 ? [1e9, 'bn'] : [1e6, 'mn'];
  const scaled = (value / scale).toFixed(2).replace('.', ',');
  return `Rp ${scaled} ${suffix}`;
}

/** The feed packs times as HHMMSS integers, so 09:00:06 arrives as 90006. */
export function formatTime(hhmmss) {
  const s = String(hhmmss).padStart(6, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

/** ...and dates as YYYYMMDD integers. */
export function formatDate(yyyymmdd) {
  const s = String(yyyymmdd);
  return `${Number(s.slice(6, 8))} ${MONTHS[Number(s.slice(4, 6)) - 1]} ${s.slice(0, 4)}`;
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Around 92% of nego deals are crossings — the same broker on both sides ("tutup sendiri").
 * Printing that broker twice with an arrow between it reads like a bug, so name it once.
 */
function counterparties(deal) {
  const buyer = `${escapeHtml(deal.buyer_name)} (${escapeHtml(deal.buyer_code)})`;
  if (deal.buyer_code === deal.seller_code) return `🔁 Crossing: ${buyer}`;
  const seller = `${escapeHtml(deal.seller_name)} (${escapeHtml(deal.seller_code)})`;
  return `${seller} → ${buyer}`;
}

export function formatDeal(deal) {
  const link = `${SITE}/ticker.html?code=${encodeURIComponent(deal.code)}`;
  return [
    `🔔 <b>Big Nego Deal — ${formatIdrShort(deal.value)}</b>`,
    '',
    `<a href="${link}"><b>${escapeHtml(deal.code)}</b></a> · ${escapeHtml(deal.stock_name)}`,
    `Rp ${formatNumber(deal.price)} × ${formatNumber(deal.volume)} shares`,
    `${formatTime(deal.time)} WIB · ${formatDate(deal.date)}`,
    '',
    counterparties(deal),
  ].join('\n');
}
