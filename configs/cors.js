var whitelist = ['https://dev.taxlah.com', 'https://staging.taxlah.com', 'https://taxlah.com']
var corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}

module.exports = corsOptions