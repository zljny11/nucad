//用于数据库连接、关闭、sql执行、dateTime格式转换
var mysql = require('mysql');
var connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'radyn123',
  database: 'radyn',
  port: '3306'
});
// //创建连接池 暂未使用
// var pool = mysql.createPool({
//     host: 'localhost',
//     user: 'root',
//     password: 'radyn123',
//     database: 'radyn',
// })

// //使用连接池执行
// function doSQL_pool(sql) {
//     pool.getConnection(function (err, connection)){

//     }

// }


//数据库连接
function connectMysql() {
  connection.connect(err => {
    if (err) throw err;
    console.log('mysql test connected ')
  })
};
//sql语句执行
function doSQL(sql) {
  connection.query(sql, function (error, results) {
    if (error) throw error;
    // console.log('The solution is: ', results);
  });
};
//查询数据库
function getAlldomain(type, value, callback) {
  var sql = 'select * from domain ';
  var option = [];
  var dataStr = "";
  connection.query(sql, function (err, results) {
    //处理查询结果
    if (results) {
      for (var i = 0; i < results.length; i++) {
        //option[i] = {'label':results[i].domain,'value':results[i].domain};
        //console.log(results[i].domain);
        option.push({ 'label': results[i].domain, 'value': results[i].domain });
      }
    }
    callback(err, option);//回调函数返回option数组
  });
}

//数据库断开连接
//connection.destroy();
function closeMysqlConnection() {
  connection.end(function (err) {
    if (err) {
      return console.err('error:' + err.message);
    }
    console.log('Close the database connection.');
  })
};
//将js中的数据对象转化为mysql中 dateTime格式
function toSqlDateTime(date) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();
  let hour = date.getHours();
  let minute = date.getMinutes();
  minute = minute > 9 ? minute : "0" + minute.toString()
  let second = date.getSeconds();
  second = second > 9 ? second : "0" + second.toString()

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export { connectMysql, closeMysqlConnection, doSQL, connection, toSqlDateTime };
// let findUser = 'SELECT * FROM seriesInfo'
// doSQL(findUser)