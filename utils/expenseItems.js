/**
 * Normalisation and validation for expense line items.
 *
 * Items reach the API from three directions — the OCR extractor, the create form
 * and the update form — and each used to apply its own partial rules, which is
 * how rows with RM0.00 and negative unit prices ended up stored. Every path now
 * funnels through here.
 *
 * A receipt line can never cost less than nothing: a negative number on a
 * receipt is a discount or rounding line, which belongs in the total, not in a
 * stored item price.
 */

const round2 = (n) => Math.round(n * 100) / 100;

/** Parses "RM 12.50", "12,50", " 12.50 " and plain numbers; NaN when hopeless. */
function parseAmount(value) {
    if (value === null || value === undefined) return NaN;
    if (typeof value === 'number') return value;
    const cleaned = String(value).replace(/[^0-9.\-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN;
    return parseFloat(cleaned);
}

/**
 * Normalises one raw item. Returns null when the line carries no usable data —
 * callers drop those rather than storing empty rows.
 *
 * Missing figures are derived from the ones present (unit price from
 * total/quantity and vice versa) instead of defaulting to 0, which is what put
 * RM0.00 lines in front of users.
 */
function normaliseItem(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const name = raw.item_name ? String(raw.item_name).trim() : '';

    let quantity = parseInt(raw.item_quantity, 10);
    if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;

    let unit = parseAmount(raw.item_unit_price);
    let total = parseAmount(raw.item_total_price);

    // Derive whichever side is missing or non-positive from the other.
    if ((!Number.isFinite(unit) || unit <= 0) && Number.isFinite(total) && total > 0) {
        unit = total / quantity;
    }
    if ((!Number.isFinite(total) || total <= 0) && Number.isFinite(unit) && unit > 0) {
        total = unit * quantity;
    }

    const hasMoney = Number.isFinite(unit) && unit > 0 && Number.isFinite(total) && total > 0;

    // A line with neither a name nor a usable price is OCR noise.
    if (!name && !hasMoney) return null;

    return {
        item_sku_unit: raw.item_sku_unit ? String(raw.item_sku_unit).trim().slice(0, 100) : null,
        item_name: name ? name.slice(0, 255) : null,
        item_unit_price: hasMoney ? round2(unit) : null,
        item_quantity: quantity,
        item_total_price: hasMoney ? round2(total) : null,
    };
}

/**
 * Strict validation for user-submitted items (create/update).
 *
 * Unlike normaliseItem — which repairs what OCR produced — user input is
 * rejected with a reason, so the form can point at the exact line. Returns
 * { items } or { errors }.
 */
function validateSubmittedItems(rawItems) {
    if (!Array.isArray(rawItems)) return { items: [] };

    const errors = [];
    const items = [];

    rawItems.forEach((raw, i) => {
        const line = i + 1;
        const name = raw?.item_name ? String(raw.item_name).trim() : '';
        const unit = parseAmount(raw?.item_unit_price);
        const quantity = parseInt(raw?.item_quantity, 10);
        const total = parseAmount(raw?.item_total_price);

        if (!name) errors.push(`Item ${line}: name is required.`);
        if (!Number.isFinite(unit) || unit <= 0) {
            errors.push(`Item ${line}: unit price must be a positive number.`);
        }
        if (!Number.isFinite(quantity) || quantity < 1) {
            errors.push(`Item ${line}: quantity must be at least 1.`);
        }
        if (!Number.isFinite(total) || total <= 0) {
            errors.push(`Item ${line}: total must be a positive number.`);
        }

        if (!errors.length) {
            items.push({
                item_sku_unit: raw.item_sku_unit ? String(raw.item_sku_unit).trim().slice(0, 100) : null,
                item_name: name.slice(0, 255),
                item_unit_price: round2(unit),
                item_quantity: quantity,
                item_total_price: round2(total),
            });
        }
    });

    return errors.length ? { errors } : { items };
}

/** Normalises an OCR item array: repair each line, drop the unusable ones. */
function normaliseExtractedItems(rawItems) {
    if (!Array.isArray(rawItems)) return [];
    return rawItems.map(normaliseItem).filter(Boolean);
}

module.exports = { parseAmount, normaliseItem, normaliseExtractedItems, validateSubmittedItems };
