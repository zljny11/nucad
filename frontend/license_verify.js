const fs = require('fs');
const crypto = require('crypto');
const path = require('path')
const Store = require('electron-store');
const store = new Store();
const userData = store.get('address') || require('electron').app.getPath('userData')
const sep = path.sep;
const os = require("os");

function licenseVerify(){
  // obtain the mac address of the computer
  const networksObj = os.networkInterfaces();
  // console.log(networksObj)
  var mac = ''
  for(var i in networksObj){
    for(var j in networksObj[i]){
      if(networksObj[i][j]["family"]==="IPv4" && networksObj[i][j]["mac"]!=="00:00:00:00:00:00" && networksObj[i][j]["address"]!=="127.0.0.1" && networksObj[i][j]["address"]!=="172.17.0.1"){
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

  const licensePath = userData + sep + 'config' + sep + 'license'
  if (!fs.existsSync(licensePath)) {
    return [false, mac, '', '0', []]
  }
  // read the license
  let signature = fs.readFileSync(licensePath);
  // decrypt the license
  let decrypted = crypto.publicDecrypt(publicKey, Buffer.from(signature));
  let verify_str = decrypted.toString()
  // verify the decrypted string
  if (verify_str.length >= 32) {
    var macAddress = verify_str.substr(0, 17)
    var expireDate = verify_str.substr(17, 8)
    var usage = verify_str.substr(25, 5)
    var validProducts = parseInt(verify_str.substr(30, 3)).toString(2)
    var productArray = [		
      Boolean(parseInt(validProducts%10000000/1000000)),		
      Boolean(parseInt(validProducts%1000000/100000)),		
      Boolean(parseInt(validProducts%100000/10000)),		
      Boolean(parseInt(validProducts%10000/1000)),		
      Boolean(parseInt(validProducts%1000/100)),		
      Boolean(parseInt(validProducts%100/10)),		
      Boolean(parseInt(validProducts%10/1))		
    ]
    // verify the mac address
    if (macAddress === mac) {
      // console.log('mac address correct!')
      // parse the date and verify
      let std_date = expireDate.substr(0,4) + '-' + expireDate.substr(4,2) + '-' + expireDate.substr(6,2)
      let date_expire = new Date(std_date)
      let date_now = new Date()
      if (date_expire.getTime() >= date_now.getTime()) {
        flag = true
        // console.log('license valid!')
      }
      else{
        // console.log('license expired!')
      }
    }
    else{
      // console.log('mac address error!')
    }
  }
  else{
    // console.log('license length is incorrect!')
  }
  return [flag, mac, expireDate, usage, productArray]
}

module.exports.licenseVerify = licenseVerify;
