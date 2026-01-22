const express = require('express')
const queues = require('../../queue')
const router = express.Router()

router.get('/cronjob', async (req, res) => {
    const users = ["user1", "user2", "user3", "user4", "user5", "user6"]

    for (const user of users) {
        console.log(`Cronjob executed for ${user} at ${new Date().toISOString()}`)

        if(user == 'user2') {
            await queues.default.add('General Queue', { user }, { priority: 1 } )
        } else {
            await queues.default.add('General Queue', { user }, { priority: 5 } )
        }
    }
    res.json({ success: true, message: 'Cronjob tasks queued' })
})

module.exports = router