const express = require('express')
const mailService = require('../../services/MailService')
const router = express.Router()

router.post("/send-email", async (req, res) => {

    const { to, subject, text, html, from, attachments } = req.body

    const result = await mailService.sendMail({ to, subject, text, html, from, attachments })

    if (result.success) {
        return res.status(200).json(result)
    } else {
        return res.status(400).json(result)
    }
})

module.exports = router