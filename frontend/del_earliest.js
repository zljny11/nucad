const fs = require('fs');
const path = require('path')
const sep = path.sep;
const childprocess = require("child_process");

const Store = require('electron-store');
const store = new Store();
const userData = store.get('address')

function del_earliest() {
  childprocess.exec("docker rm $(docker ps -aq)")

  var a1 = fs.readdirSync(userData + sep + 'config' + sep + 'input')
  var a2 = fs.readdirSync(userData + sep + 'config' + sep + 'output')
  var arr1 = []
  var arr2 = []

  for (let i = 0; i < a1.length; i++) {
    arr1.push(parseInt(a1[a1.length - i - 1].trim().split('_').pop()))
    arr1.sort(function (a, b) { return a - b })
  }
  for (let i = 0; i < a2.length; i++) {
    arr2.push(parseInt(a2[a2.length - i - 1].trim().split('_').pop()))
    arr2.sort(function (a, b) { return a - b })
  }

  var name1 = a1.find(function (num) {
    return num.split('_').pop() == arr1[1]
  })
  var name2 = a2.find(function (num) {
    return num.split('_').pop() == arr2[1]
  })

  return [name1, name2]
}
module.exports.del_earliest = del_earliest