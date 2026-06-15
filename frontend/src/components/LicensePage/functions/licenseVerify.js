import { getElectronStore, safeWindowRequire } from "../../../utils/electron";
const store = getElectronStore()
const isDevelopment = process.env.NODE_ENV === 'development'

function getDevLicenseResult(mac) {
  return [true, mac, '20991231', '9999', '1111111']
}

function licenseVerify() {
  if (!safeWindowRequire) {
    return getDevLicenseResult("browser-dev")
  }
  const fs = safeWindowRequire('fs')
  const crypto = safeWindowRequire('crypto')
  const os = safeWindowRequire("os")
  const path = safeWindowRequire("path")
  const sep = path.sep
  const userData = store.get('address')
  // obtain the mac address of the computer
  const networksObj = os.networkInterfaces()
  // console.log(networksObj)
  var mac = ''
  for (var i in networksObj) {
    for (var j in networksObj[i]) {
      if (networksObj[i][j]["family"] === "IPv4" && networksObj[i][j]["mac"] !== "00:00:00:00:00:00" && networksObj[i][j]["address"] !== "127.0.0.1" && networksObj[i][j]["address"] !== "172.17.0.1") {
        mac = networksObj[i][j]["mac"]
      }
    }
  }

  let flag = false
  // let publicKey = fs.readFileSync(`./license/public.pem`).toString()
  let publicKey = 
`-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEPF4evPR+o3q7AlmWsWal+LnT
yhgQAIrvu6tw54s42+IhEQ/XsXaFzbfeXrQyP3wuNJLvmGWPYyEvu+crHmhgg+pC
lkqOFuIB7eNUaCP7bnt5kSesrdJI4Y1rmh8c349Tbqnc4WbZa+5Qm9c8Sz6MkEau
54RDnB3lgonHZmSN/wIDAQAB
-----END PUBLIC KEY-----`
              
  const licensePath = userData + sep + 'config' + sep + "license"
  if (!userData || !fs.existsSync(licensePath)) {
    return isDevelopment ? getDevLicenseResult(mac) : [false, mac, '', '0', '0']
  }
  // read the license
  let signature = fs.readFileSync(licensePath)
  // decrypt the license
  let decrypted = crypto.publicDecrypt(publicKey, Buffer.from(signature))
  let verify_str = decrypted.toString()
  // verify the decrypted string
  if (verify_str.length >= 30) {
    var macAddress = verify_str.substr(0, 17)
    var expireDate = verify_str.substr(17, 8)
    var usage = verify_str.substr(25, 4)
    var validProducts = parseInt(verify_str.substr(29, 2)).toString(2)
    if (macAddress === mac) {
      let std_date = expireDate.substr(0, 4) + '-' + expireDate.substr(4, 2) + '-' + expireDate.substr(6, 2)
      let date_expire = new Date(std_date)
      let date_now = new Date()
      if (date_expire.getTime() >= date_now.getTime()) {
        flag = true
        // console.log('license valid!')
      }
      else {
        console.log('license expired!')
      }
    }
    else {
      console.log('mac address error!')
    }
  }
  else {
    console.log('license length is incorrect!')
  }
  return flag || !isDevelopment
    ? [flag, mac, expireDate, usage, validProducts]
    : getDevLicenseResult(mac)
}

export { licenseVerify }
