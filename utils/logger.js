const fs    = require("fs")
const moment = require("moment")

const path  = "./assets/logs/"

function Logger(filename = "error.log", data) {
    let fullpath = path + filename
    if(!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true })
    }

    fs.appendFileSync(fullpath, `${moment().format('YYYY-MM-DD hh:mm A >> ')} ${JSON.stringify(data)} \n\n`)
}

module.exports = {
    Logger
}