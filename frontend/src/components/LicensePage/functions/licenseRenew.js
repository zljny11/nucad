const { Base64 } = require('js-base64')
Base64.extendString()
import { getElectronStore, safeWindowRequire } from "../../../utils/electron";
const store = getElectronStore()
const isDevelopment = process.env.NODE_ENV === 'development'

function licenseRenew(renew_string) {
  if (!safeWindowRequire) {
    store.set('attempts', 5)
    return store.get('attempts')
  }
  const fs = safeWindowRequire('fs')
  const crypto = safeWindowRequire('crypto')
  const path = safeWindowRequire('path')
  const sep = path.sep
  const userData = store.get('address')
  if (isDevelopment && (!userData || !fs.existsSync(userData + sep + 'config' + sep + "license"))) {
    store.set('attempts', 5)
    alert('开发模式下已跳过证书更新。')
    document.getElementsByClassName('license_input')[0].value = ''
    return store.get('attempts')
  }
  const privateKey =
    `-----BEGIN RSA PRIVATE KEY-----
MIICXgIBAAKBgQDEPF4evPR+o3q7AlmWsWal+LnTyhgQAIrvu6tw54s42+IhEQ/X
sXaFzbfeXrQyP3wuNJLvmGWPYyEvu+crHmhgg+pClkqOFuIB7eNUaCP7bnt5kSes
rdJI4Y1rmh8c349Tbqnc4WbZa+5Qm9c8Sz6MkEau54RDnB3lgonHZmSN/wIDAQAB
AoGATX0lEXA9/6/ga+5OoDHnPczM3HPmMpN0SZxK46ebE1XIopQRNHQwQD/uxlGR
SHJHQBuklhYQrKFRXn8NlrpILnrYGV7A5aH5z1mKs66CYNebuHB5E4AskxYTnK5l
rTK/hIpeR6Oo4AugANUvi9FcmrDsuSMrDDdA5VyDWfrpEcECQQD0m2gI4vV9VnR3
yivYlDN9ttfJupWsd9Smx3WTxtDML2VeUeLTg/iGxMI8Dzb+QkT/GCtYDwiU0BlW
Q35pvaHfAkEAzWAz1zo6CB2biNBUddJSgqweXoY01nC1eNcB9u3pIToCpAakosI1
H0nR6ADAnDpF/TC/uctv7dIM0HpVOxnX4QJBAOqlOcNslLpLeSaAllcIs+xgvdgS
WQo9WY0zwaKlEh8NSFyWiNUGwB3oGburjMGTqMRc1xd+NGksx2FtFZMyClkCQQCd
d5qn9kwSdukPMHTh1b5P1LqATTRsCwUJPwmRk/7A7CKkMze+V1u1vrsDwLft0Txi
kiMeyJ3sYbZTjsiUxQ7hAkEA4KZvMyhVHSV4IZRppTr7my95ZUfrdwuDg+dHbx6i
Rd2tCc6QuUNqHo9YisG7cv90JCgz1bhikaV5S8oZzLiMIg==
-----END RSA PRIVATE KEY-----`

  const publicKey =
    `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEPF4evPR+o3q7AlmWsWal+LnT
yhgQAIrvu6tw54s42+IhEQ/XsXaFzbfeXrQyP3wuNJLvmGWPYyEvu+crHmhgg+pC
lkqOFuIB7eNUaCP7bnt5kSesrdJI4Y1rmh8c349Tbqnc4WbZa+5Qm9c8Sz6MkEau
54RDnB3lgonHZmSN/wIDAQAB
-----END PUBLIC KEY-----`

  var signature = fs.readFileSync(userData + sep + 'config' + sep + "license")
  var decrypted = crypto.publicDecrypt(publicKey, Buffer.from(signature))

  var verify_str = decrypted.toString()
  var macAddress = verify_str.substr(0, 17)
  var validProducts = verify_str.substr(29, 3)

  /* var key = '7Bs8dNEcxMJH34Qipz5gk6sa0TW2oRl9Y1Vf'
  var l = key.length
  var d = 0
  var b, b1, b2, b3, s
  s = new Array(Math.floor(renew_string.length / 3))
  b = s.length
  for (var i = 0; i < b; i++) {
    b1 = key.indexOf(renew_string.charAt(d))
    d++
    b2 = key.indexOf(renew_string.charAt(d))
    d++
    b3 = key.indexOf(renew_string.charAt(d))
    d++
    s[i] = b1 * l * l + b2 * l + b3
  }
  var new_date = eval("String.fromCharCode(" + s.join(',') + ")")
  new_date = parseInt(new_date, 36) */

  const new_date = parseInt(renew_string.fromBase64(), 36).toString().substring(2, 14)

  if (new_date.length === 12) {
    alert('证书更新成功！')
    //new license str
    var str = macAddress + new_date + validProducts
    //encrypt
    const signature2 = crypto.privateEncrypt(privateKey, Buffer.from(str))
    // console.log(signature2)
    fs.writeFileSync(userData + sep + 'config' + sep + "license", signature2)

    store.set('usage', parseInt(new_date.substr(8)))
    store.set('attempts', 5)
  }
  else {
    store.set('attempts', store.get('attempts') - 1)
    alert('输入的激活码有误！')
  }
  document.getElementsByClassName('license_input')[0].value = ''
  document.getElementsByClassName('license_input')[0].focus()
  return store.get('attempts')
}

export { licenseRenew }
