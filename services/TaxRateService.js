/**
 * Malaysian service tax, read from configuration rather than repeated as a literal.
 *
 * The rate was hardcoded in six places, all still saying 6% — a standing liability
 * every time the government changes it, since one missed copy silently charges the
 * wrong amount. Reading it here means the charge and the figure the app shows the
 * customer cannot drift apart.
 */
const ConfigService = require('./ConfigService');

const FALLBACK_SST_RATE = 0.06;

/** Current rate as a decimal, e.g. 0.06. Falls back if config is unreachable. */
async function getSstRate() {
    const raw = await ConfigService.get('app', 'SST_RATE', String(FALLBACK_SST_RATE));
    const rate = parseFloat(raw);
    // A malformed rate must never silently become 0% or something absurd.
    return Number.isFinite(rate) && rate >= 0 && rate < 1 ? rate : FALLBACK_SST_RATE;
}

/** Splits a tax-exclusive price into the parts a customer should see. */
async function priceBreakdown(exclusiveAmount) {
    const rate = await getSstRate();
    const subtotal = parseFloat(Number(exclusiveAmount || 0).toFixed(2));
    const tax = parseFloat((subtotal * rate).toFixed(2));
    // Total is derived from the rounded parts so subtotal + tax always equals total.
    const total = parseFloat((subtotal + tax).toFixed(2));

    return { subtotal, sst_rate: rate, sst_amount: tax, total };
}

module.exports = { getSstRate, priceBreakdown, FALLBACK_SST_RATE };
