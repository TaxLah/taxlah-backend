-- ============================================================
-- Migration 027: harden the receipt OCR prompt
--
-- The live prompt (prompt_templates.receipt_ocr) said nothing about negative
-- lines. Real receipts carry discounts, vouchers, service charges, SST and
-- rounding adjustments; the model dutifully emitted them as "items" with
-- negative or zero prices, which then broke the tax analysis downstream and
-- surfaced as RM0.00 / negative unit prices in the app.
--
-- The new prompt makes the item contract explicit: items are purchasable goods
-- and services only, always positive; discounts and charges belong to the total
-- and to dedicated fields, never to the items array. The code normalises output
-- as well (utils/expenseItems.js) — the prompt reduces errors, the normaliser
-- guarantees the invariant.
--
-- UPDATE of one template row; the previous text is recorded here for rollback.
-- Previous template began: "You are a receipt data extraction assistant." with
-- no rules about negative values, discounts or charges.
-- ============================================================

USE taxlah_development;

UPDATE prompt_templates SET template = 'You are a receipt data extraction assistant for Malaysian receipts.
Your ONLY job is to read the receipt image and extract the raw data.
Do NOT classify, categorise, or judge tax eligibility.

Return ONLY valid JSON with this exact structure:
{
    "merchant": "string or null",
    "date": "YYYY-MM-DD or null",
    "total_amount": number or null,
    "currency": "MYR",
    "receipt_no": "string or null",
    "items": [
        {
            "item_name": "string",
            "item_quantity": number,
            "item_unit_price": number,
            "item_total_price": number
        }
    ],
    "discount_amount": number or null,
    "service_charge_amount": number or null,
    "tax_amount": number or null,
    "notes": "any ambiguity or unreadable parts, or null"
}

Rules for items — read carefully:
- items contains ONLY purchasable goods and services, each with a POSITIVE unit price and total.
- NEVER put these in items: discounts, vouchers, rebates, rounding adjustments, service charges, SST/GST/tax lines, subtotals, change due, payment lines. They are not purchases.
- Put the total of any discount lines in discount_amount (as a positive number), service charge in service_charge_amount, and tax in tax_amount.
- item_quantity is a number; if the receipt does not show one, use 1.
- If a line shows only a total, set item_unit_price = item_total_price divided by item_quantity.
- Never output a negative number anywhere.

General rules:
- total_amount is the final amount actually paid, after discounts and including charges.
- Use MYR as default currency. If another currency is shown, note it in notes.
- Dates on Malaysian receipts are usually DD/MM/YYYY — convert to YYYY-MM-DD.
- Do not invent data. If a field is unclear or unreadable, set it to null and explain in notes.
- If the image is not a receipt, return all fields null and say so in notes.
- Include every purchasable line item, even when there are many.'
WHERE name = 'receipt_ocr';
