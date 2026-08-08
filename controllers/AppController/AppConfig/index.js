/**
 * Runtime configuration the app reads on the dashboard.
 *
 * Everything here used to be hardcoded in the mobile bundle — the beta banner copy and
 * the "Explore" carousel cards — which meant changing either required a release, and
 * users on older builds would never see the change at all.
 *
 * Reads go through ConfigService, so they are served from the in-process cache and only
 * hit MySQL after an admin edit invalidates it over Redis.
 */

const express = require('express')
const router = express.Router()

const {
    DEFAULT_API_RESPONSE,
    SUCCESS_API_RESPONSE,
    INTERNAL_SERVER_ERROR_API_RESPONSE,
} = require('../../../configs/helper')

const { auth } = require('../../../configs/auth')
const ConfigService = require('../../../services/ConfigService')
const Advertisement = require('../../../models/AppModel/AdvertisementService')
const { getAccountUsage } = require('../../../models/AppModel/UsageService')
const { getSstRate } = require('../../../services/TaxRateService')

const DEFAULT_AD_LIMIT = 5

/**
 * GET /api/app-config
 *
 * One call for everything the dashboard needs: whether the beta banner should show, and
 * the adverts that belong on the dashboard itself. Keeping it to a single request
 * matters because this runs on every dashboard focus.
 */
router.get('/', auth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        // Only an explicit "Live" ends the beta. Anything else — a typo, a stray space,
        // a value written before APP_MODE was constrained — keeps the banner up rather
        // than silently telling 1,400 users the beta is over.
        const mode = String((await ConfigService.get('app', 'APP_MODE', 'Beta')) || 'Beta').trim()
        const isBeta = mode.toLowerCase() !== 'live'

        const rawLimit = await ConfigService.get('app', 'DASHBOARD_AD_LIMIT', String(DEFAULT_AD_LIMIT))
        const parsedLimit = parseInt(rawLimit, 10)
        // A misconfigured limit must not empty the carousel or dump all 50 adverts onto
        // the dashboard, so clamp rather than trust.
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 20)
            : DEFAULT_AD_LIMIT

        // Usage is folded in here rather than given its own endpoint: the dashboard
        // needs it on the same render, and this call already runs on every focus.
        // A failure to measure it must not take the dashboard down, so it degrades
        // to null and the card simply does not render.
        const [advertisements, totalLive, usage] = await Promise.all([
            Advertisement.listLive({ limit }),
            Advertisement.countLive(),
            getAccountUsage(req.payload?.aid ?? req.payload?.account_id)
                .catch((e) => {
                    console.error('[AppConfig] usage failed:', e.message)
                    return null
                }),
        ])

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'App configuration retrieved.'
        response.data = {
            app_mode: isBeta ? 'Beta' : 'Live',
            // Only sent while in beta. The app therefore does not need its own copy of
            // the text, and cannot show a stale banner after the switch to Live.
            beta_banner_text: isBeta
                ? await ConfigService.get('app', 'BETA_BANNER_TEXT', '')
                : null,
            advertisements,
            // Lets the app decide whether "See all" is worth rendering at all.
            advertisement_total: totalLive,
            usage,
            // So the app can show the same total the payment gateway will charge,
            // rather than the tax-exclusive price it used to display.
            sst_rate: await getSstRate(),
        }
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[AppConfig] error:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        response.message = 'Unable to load app configuration.'
        return res.status(response.status_code).json(response)
    }
})

/**
 * GET /api/app-config/advertisements
 *
 * Every live advert, for the "See all" screen.
 */
router.get('/advertisements', auth(), async (req, res) => {
    let response = { ...DEFAULT_API_RESPONSE }
    try {
        const advertisements = await Advertisement.listLive()

        response = { ...SUCCESS_API_RESPONSE }
        response.message = 'Advertisements retrieved.'
        response.data = advertisements
        return res.status(response.status_code).json(response)
    } catch (e) {
        console.error('[AppConfig] advertisements error:', e)
        response = { ...INTERNAL_SERVER_ERROR_API_RESPONSE }
        response.message = 'Unable to load advertisements.'
        return res.status(response.status_code).json(response)
    }
})

module.exports = router
