const fs = require('fs');

// Return true when the current filesystem is at least 50% full.
var disk_capacity = function () {
  return new Promise((res) => {
    fs.statfs('.', (err, stats) => {
      if (err || !stats || !stats.blocks) {
        res(false)
        return
      }

      const usedRatio = 1 - stats.bavail / stats.blocks
      res(usedRatio >= 0.5)
    })
  })
}

module.exports.disk_capacity = disk_capacity
