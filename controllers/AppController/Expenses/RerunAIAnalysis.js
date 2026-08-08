/**
 * Re-run the AI tax analysis for one expense.
 *
 * POST /api/expenses/rerun-ai/:id
 *
 * Requested by users whose receipt was analysed wrongly (or whose analysis
 * failed) and who want a second opinion. Deliberately narrow:
 *
 *   - paid subscribers with the ai_categorization feature only — this burns an
 *     OpenAI call on demand, so it rides on the paid gate even while general
 *     quota gating is off for the beta;
 *   - once per expense, enforced by ai_rerun_count on the row, not client state.
 *
 * The exception is a Failed analysis: retrying a failure does not consume the
 * re-run, because the user never received the analysis they were promised. A job
 * that has sat in Queued/Processing past STALE_AFTER_MINUTES counts as the same
 * kind of failure — see the staleness check below.
 */

const express = require('express');
const router = express.Router();
const {
    DEFAULT_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
    BAD_REQUEST_API_RESPONSE,
    NOT_FOUND_API_RESPONSE,
    FORBIDDEN_API_RESPONSE,
} = require('../../../configs/helper');
const ExpensesModel = require('../../../models/AppModel/Expenses');
const { checkSubscriptionAccess } = require('../../../models/AppModel/SubscriptionService');
const db = require('../../../utils/sqlbuilder');

/**
 * How long a row may sit in Queued/Processing before we stop believing it.
 *
 * An analysis normally finishes in seconds. A row still pending long after that
 * means its job is gone — the worker died mid-job, or the job was enqueued under
 * a queue name nothing listens on any more (which is exactly what stranded the
 * receipts uploaded before the queue names were environment-prefixed: they sat in
 * Queued forever, and this endpoint refused to retry them because it read them as
 * still running). Treating them as running made the state unrecoverable from the
 * app, so past this age a re-run is allowed — and, like a Failed retry, it does
 * not consume the user's one re-run, because they never got their analysis.
 */
const STALE_AFTER_MINUTES = 30;

router.post('/:id', async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE };

    try {
        const account_id = req.user.account_id;
        const expenses_id = parseInt(req.params.id);

        if (!expenses_id || isNaN(expenses_id)) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'Invalid expense ID' };
            return res.status(response.status_code).json(response);
        }

        const owned = await ExpensesModel.getExpenseById(account_id, expenses_id);
        if (!owned.status) {
            response = { ...NOT_FOUND_API_RESPONSE, message: 'Expense not found' };
            return res.status(response.status_code).json(response);
        }
        const expense = owned.data;

        const isPending = expense.ai_processing_status === 'Queued' || expense.ai_processing_status === 'Processing';

        // Age the pending state off last_modified, which the queueing path stamps.
        const pendingSince = expense.last_modified || expense.created_date;
        const pendingMinutes = pendingSince
            ? (Date.now() - new Date(pendingSince).getTime()) / 60000
            : Infinity;
        const isStale = isPending && pendingMinutes >= STALE_AFTER_MINUTES;

        if (isPending && !isStale) {
            response = { ...BAD_REQUEST_API_RESPONSE, message: 'An analysis is already running for this expense.' };
            return res.status(response.status_code).json(response);
        }

        // A stranded job is a failure the user was never told about, so it is
        // retried on the same terms as an explicit Failed.
        const isRetryOfFailure = expense.ai_processing_status === 'Failed' || isStale;

        // The once-only limit. Checked on the row so reinstalling the app or calling
        // the API directly cannot reset it.
        if (!isRetryOfFailure && Number(expense.ai_rerun_count) >= 1) {
            response = {
                ...FORBIDDEN_API_RESPONSE,
                message: 'This expense has already used its AI re-run.',
                data: { rerun_used: true }
            };
            return res.status(response.status_code).json(response);
        }

        // Paid-subscriber gate. This endpoint spends money per call, so it stays
        // gated even while the beta leaves general limits off.
        //
        // It does not apply to a failed or stranded analysis: the gate is there for
        // asking again about a result the user already received, and someone whose
        // analysis never arrived has not had that. Gating it would leave free users
        // permanently stuck on our own failure, with no route out of the app.
        if (!isRetryOfFailure) {
            const subscription = await checkSubscriptionAccess(account_id);
            const hasAI = subscription.success && subscription.has_access && subscription.features?.ai_categorization;
            if (!hasAI) {
                response = {
                    ...FORBIDDEN_API_RESPONSE,
                    message: 'AI re-analysis is available on paid plans. Upgrade to re-run this analysis.',
                    data: { upgrade_required: true }
                };
                return res.status(response.status_code).json(response);
            }
        }

        // Items from the DB, not the client — the analysis re-reads what is stored.
        const itemsResult = await ExpensesModel.getExpenseItems(expenses_id);
        const items = (itemsResult.data || []).map((i) => ({
            item_name: i.item_name,
            item_quantity: i.item_quantity,
            item_unit_price: i.item_unit_price,
            item_total_price: i.item_total_price,
        }));

        // Consume the re-run BEFORE queueing (except failure retries): if the job is
        // enqueued first and the update fails, the user gets a free unlimited loop.
        // The WHERE guard makes two concurrent taps race safely — only one wins.
        if (!isRetryOfFailure) {
            const consumed = await db.raw(
                `UPDATE account_expenses
                    SET ai_rerun_count = ai_rerun_count + 1, last_modified = NOW()
                  WHERE expenses_id = ? AND account_id = ? AND ai_rerun_count < 1`,
                [expenses_id, account_id]
            );
            if (!consumed.affectedRows) {
                response = { ...FORBIDDEN_API_RESPONSE, message: 'This expense has already used its AI re-run.', data: { rerun_used: true } };
                return res.status(response.status_code).json(response);
            }
        }

        await db.raw(
            `UPDATE account_expenses SET ai_processing_status = 'Queued', last_modified = NOW() WHERE expenses_id = ?`,
            [expenses_id]
        );

        await ExpensesModel.dispatchAIReceiptAnalysis(expenses_id, account_id, {
            merchant: expense.expenses_merchant_name,
            date: expense.expenses_date,
            total_amount: parseFloat(expense.expenses_total_amount),
            items,
        });

        response = {
            status_code: 200,
            status: 'success',
            message: 'Re-analysis queued. You will be notified when it completes.',
            data: {
                expenses_id,
                ai_processing_status: 'Queued',
                rerun_used: !isRetryOfFailure,
            }
        };
        return res.status(response.status_code).json(response);
    } catch (error) {
        console.error('[RerunAIAnalysis] Error:', error);
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE, message: 'Could not queue the re-analysis.' };
        return res.status(response.status_code).json(response);
    }
});

module.exports = router;
