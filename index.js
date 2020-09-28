const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const nm = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const {PerformanceObserver, performance} = require("perf_hooks");
const MongoClient = require("mongodb").MongoClient;
const nmclient = nm.createTransport({
  service: process.env.service,
  auth: {
    user: process.env.user,
    pass: process.env.pass
  }
});
var emailId = 0;
var verEmail;
var subVerEmail;
var onlineUsers = [];
var logo;
var f;
var nextServerId;
//mongo
var db;
const mdbClient = new MongoClient("mongodb+srv://" + process.env.mongoName + ":" + process.env.mongoPass + "@ucdb-cyla3.mongodb.net/test?retryWrites=true&w=majority", {useNewUrlParser: true, useUnifiedTopology: true});
mdbClient.connect(async function(err) {
  if (err) {
    throw err;
  } else {
    console.log("Connected to database");
    db = mdbClient.db("main");
    nextServerId = await db.collection("id").find({"main": true}, {projection:{_id: 0}}).toArray();
    nextServerId = nextServerId[0].servers;
    let timeTaken = 0;
    let rounds = 2;
    for (i=0; i<rounds; i++) {
      let start = performance.now();
      admin = await db.collection("accounts").find({"name": "admin"}, {projection:{_id: 0}}).toArray();
      //the first one is much slower
      if (i!==0) timeTaken += performance.now() - start
    }
    console.log("Average db response time: " + timeTaken/(rounds-1) + "ms");
  }
});
//end mongo
const emailRegex = RegExp("^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$");
var idCount = 0;
//todo: implement log saving
var log = [];
var g;
/*
app.get("*", function(req, res) {
  //able to send 503 if needed
  res.status(503);
  res.sendFile(__dirname + "/503.html");
});
*/
app.get("/", function(req, res) {
  res.sendFile(__dirname + "/login.html");
});
app.get("/invite/*", async function(req, res) {
  req.originalUrl = req.originalUrl.slice(8);
  valid = await db.collection("invites").find({key: req.originalUrl}, {projection:{_id: 0}}).toArray();
  if (valid[0]) {
    if (valid[0].expiry < new Date().getTime()) {
      db.collection("invites").remove(
        {key: link}
      );
      res.sendFile(__dirname + "/inviteExpired.html");
      return;
    }
    file = fs.readFile(__dirname + "/inviteInfo.html", async function(err, data) {
      if (err) throw err;
      name = await db.collection("servers").find({id: parseInt(req.originalUrl.split("-")[0])}, {projection:{_id: 0, name: 1}}).toArray();
      data = data.toString().replace("$SERVERNAME", name[0].name);
      res.send(data.toString());
    })
  } else {
    res.sendFile(__dirname + "/inviteExpired.html");
  }
});
app.get("*", function(req, res) {
  if (req.originalUrl === "/.env") {
    res.status(403);
    res.sendFile(__dirname + "/403.html");
    return;
  }
  let newReq = req.originalUrl.split("?")[0].replace(/%20/g, " ");
  if (newReq.indexOf(".html") !== -1) {
    res.status(404);
    res.sendFile(__dirname + "/404.html");
    return;
  }
  if (!fs.existsSync(__dirname + newReq)) newReq += ".html";
  if (!fs.existsSync(__dirname + newReq) || newReq.indexOf(".") === -1) {
    res.status(404);
    res.sendFile(__dirname + "/404.html");
    return;
  }
  res.sendFile(__dirname + newReq);
});
function escapeHtml(text) {
  var map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };

  return text.replace(/[&<>"']/g, function(m) {return map[m]; });
}

function getRankPosById(id) {
  for (f=0; f<ranks.length; f++) {
    if (ranks[f].id === id) {
      return f;
    }
  }
}

async function getUserList(ranksData, server) {
  let res = await db.collection("accounts").find({
    ["server." + server]: {$exists: true}},
    {projection:{_id: 0, name: 1, server: 1}
  }).toArray();
  for (g = 0; g<res.length; g++) {
    res[g].ranks = [];
    for (a = 0; a<res[g].server[server].ranks.length; a++) {
      res[g].ranks[a] = ranksData.find(item => item.id === res[g].server[server].ranks[a]);
    };
    delete res[g].server;
  }
  return res;
}

async function getUser(user) {
  let res = await db.collection("accounts").find({"name": user}, {projection:{_id: 0}}).toArray();
  return res[0];
}

async function hasPerm(user, ranksLocal, server, perm) {
  if (!user.server[server]) {
    log.push([3000, new Date().getTime(), "validateRequest_hasPerm_" + perm, {user: user.name, server: server}]);
    console.log(log[log.length-1]);
    return false;
  }
  for (i=0; i<user.server[server].ranks.length; i++) {
    if (ranksLocal.find(rank => rank.id === user.server[server].ranks[i])[perm]) return true;
  }
  return false;
}

function rankLevel(user, ranksLocal, server) {
  bestRank = Infinity;
  for (i=0; i<user.server[server].ranks.length; i++) {
    let currentRankLevel = ranksLocal.find(rank => rank.id === user.server[server].ranks[i]).level;
    if (currentRankLevel < bestRank) bestRank = currentRankLevel;
  }
  return bestRank;
}

async function validateRequest(name, pass, socket, server, requiredPerms, aboveRank) {
  if (!io.sockets.connected[socket]) return false;
  acc = await getUser(name);
  //validation
  if (!acc || !bcrypt.compareSync(pass, acc.pass)) {
    io.sockets.connected[socket].emit("accountSyncError");
    log.push([1000, new Date().getTime(), "validateRequest", {user: name}]);
    console.log(log[log.length-1]);
    return false;
  }
  if ((!server && server !== 0) || !requiredPerms) return acc;
  ranksLocal = await db.collection("servers").find({"id": server}, {projection:{_id: 0}}).toArray();
  ranksLocal = ranksLocal[0].ranks;
  for (i=0; i<requiredPerms.length; i++) {
    let res = await hasPerm(acc, ranksLocal, server, requiredPerms[i]);
    if (!res && !acc.server[server].owner) return false;
  }
  if (!aboveRank) return {name: acc, ranks: ranksLocal};
  if (name === aboveRank) return {name: acc, above: acc, ranks: ranksLocal};
  accAbove = await getUser(aboveRank);
  if (!accAbove || !accAbove.server[server] || rankLevel(acc, ranksLocal, server) >= rankLevel(accAbove, ranksLocal, server) && !acc.server[server].owner) return false;
  return {name: acc, above: accAbove, ranks: ranksLocal};
}
//conection
io.on("connection", function(socket) {
  socket.on("chatConnect", async function(name, pass, socket) {
  acc = await validateRequest(name, pass, socket);
  let userServers = Object.keys(acc.server);
  let serverData = {};
  let allUsers = {};
  for (i=0; i<userServers.length; i++) {
    ranksLocal = await db.collection("servers").find({"id": parseInt(userServers[i])}, {projection:{_id: 0}}).toArray();
    allUsers[userServers[i]] = await getUserList(ranksLocal[0].ranks, parseInt(userServers[i]));
    serverData[userServers[i]] = ranksLocal[0];
  }
  if (onlineUsers.every(user => user !== name)) {
    onlineUsers.push(name);
  }
  //todo fix online users
  io.sockets.connected[socket].emit("firstConnect", onlineUsers, acc.verify, acc.mailLists, allUsers, serverData, acc.premium);
  io.emit("newOnlineUser", name);
  });
  socket.on("disconnectInfo", async function(name, pass) {
    acc = await validateRequest(name, pass, socket);
    if (!acc) return;
    onlineUsers.splice(onlineUsers.indexOf(name), 1);
  });
  //message
  socket.on("msg", async function(msg, name, pass, socket, time, server) {
    acc = await validateRequest(name, pass, socket);
    if (!acc) return;
    if (acc && acc.mute < new Date().getTime() && acc.verify) {
      io.to("<room>" + server).emit("msg", name, escapeHtml(msg), time);
      db.collection("servers").updateOne(   
        {"id": parseInt(server)},
        {$push: {msgLog: ["msg", name, escapeHtml(msg), time]}}
      );
    }
  });
  //login
  socket.on("login", async function(name, pass, socket) {
    acc = await validateRequest(name, pass, socket);
    if (acc) {
      io.sockets.connected[socket].emit("loginSuccess");
      console.log("Valid login attempt: " + name + " password: " + pass + " from: " + socket);
    } else {
      io.sockets.connected[socket].emit("loginError", "pass", "Your password is incorrect");
    }
  });
  //register
    socket.on("register", async function(name, pass, email, socket) {
      if (!name || !pass || !email || !io.sockets.connected[socket]) return;
      name = escapeHtml(name);
      oldAcc = await getUser(name);
      existingEmails = await db.collection("accounts").find({"email": email}, {projection:{_id: 0}}).toArray();
      if (existingEmails[0]) {
        io.sockets.connected[socket].emit("registerError", "email");
        return;
      }
      if (oldAcc) {
        io.sockets.connected[socket].emit("registerError", "name");
        return;
      }
      if (name.length < 20 && name.length > 0 && pass.length < 30 && pass.length >= 6 && /^[a-z0-9_-\s]+$/i.test(name) && !oldAcc && emailRegex.test(email)) {
        io.sockets.connected[socket].emit("registerSuccess");
        key = crypto.randomBytes(8).toString("hex");
        bcrypt.genSalt(10, function(err, salt) {
          if (err) throw err;
          bcrypt.hash(pass, salt, function(err, hash) {
            if (err) throw err;
            db.collection("accounts").insertOne({
              name: name,
              pass: hash,
              mute: 0,
              ranks: [],
              email: email,
              mailLists: [true, true],
              verify: false,
              verifyKey: key,
              //expires in 24 hours
              verifyExpiry: new Date().getTime() + 86400000,
              modHistory: [],
              server: {}
            });
          });
        });
        fs.writeFile(__dirname + "/assets/user/" + name + ".png", logo, function(err) {
          if (err) throw err;
        });
        //send verify email
        subVerEmail = verEmail;
        subVerEmail = subVerEmail.replace(/\$NAME/g, name);
        subVerEmail = subVerEmail.replace(/\$KEY/g, key);
        subVerEmail = subVerEmail.replace(/\$EMAIL/g, emailId);
        nmclient.sendMail({
          from: process.env.user,
          to: email,
          subject: "Verify your Email on Unnamed Chat",
          html: subVerEmail
        }, function(err, info) {
          if (err) console.log(err);
          console.log("Email sent: " + info.response);
        });
        //google can hide repetitive content, id fixes this
        emailId++;
        fs.writeFile(__dirname + "/data/emailId.txt", emailId, function(err) {
          if (err) throw err;
        });
      }
  });
  //admin
  socket.on("mute", async function(user, time, duration, auth, authPass, socket, server, reason) {
    acc = await validateRequest(auth, authPass, socket, server, ["canMute"], user);
    if (!acc) return;
    io.to("<room>" + server).emit("muteMsg", user, auth, duration, reason, time);
    db.collection("accounts").updateOne(
      {"name" : user},
      {$set: {["server." + server + ".mute"]: time}}
    );
    db.collection("servers").updateOne(
      {"id" : parseInt(server)},
      {$push: {msgLog: ["mute", user, auth, duration, reason, time]}}
    );
  });
  //create rank
  socket.on("createRank", async function(name, pass, socket, server) {
    acc = await validateRequest(name, pass, socket, server, ["canEditRanks"]);
    if (!acc) return;
    let idCount = 0;
    acc.ranks.forEach(r => {if (r.id+1 > idCount) idCount = r.id+1});
    db.collection("servers").updateOne(
      {"id" : parseInt(server)},
      {$push: {ranks: {name: "New Rank", id: idCount, level: idCount, color: "#ffffff"}}}
    );
  });
  socket.on("editRank", async function(name, pass, socket, server, rankId, rankData) {
    acc = await validateRequest(name, pass, socket, server, ["canEditRanks"]);
    if (!acc) return;
    let oldData = acc.ranks.find(r => r.id === rankId);
    if (rankData.name.length === 0) rankData.name = oldData.name;
    newRankData = {
      name: escapeHtml(rankData.name),
      id: oldData.id,
      level: oldData.level,
      color: rankData.color,
      canEditRanks: rankData.canEditRanks,
      canMute: rankData.canMute
    }
    db.collection("servers").updateOne(
      {id: parseInt(server), "ranks.id": oldData.id},
      {$set: {"ranks.$": newRankData}}
    );
  });
  socket.on("queryRanks", async function(socket, server) {
    if (!io.sockets.connected[socket]) return;
    let serverRanks = await db.collection("servers").find({"id": server}, {projection:{_id: 0}}).toArray();
    if (!serverRanks[0]) {
      log.push([3001, new Date().getTime(), "queryUserList", {server: server}]);
      console.log(log[log.length-1]);
      return;
    }
    serverRanks = serverRanks[0].ranks;
    io.sockets.connected[socket].emit("ranks", serverRanks);
  });
  socket.on("queryUserList", async function(socket, server) {
    if (!io.sockets.connected[socket]) return;
    let serverRanks = await db.collection("servers").find({"id": server}, {projection:{_id: 0}}).toArray();
    if (serverRanks[0]) {
      serverRanks = serverRanks[0].ranks;
    } else {
      log.push([3001, new Date().getTime(), "queryUserList", {server: server}]);
      console.log(log[log.length-1]);
      return;
    }
    res = await getUserList(serverRanks, server);
    io.sockets.connected[socket].emit("allAccounts", res);
  });
  //add rank to user
  socket.on("addRank", async function(user, rank, auth, authPass, socket, server) {
    acc = await validateRequest(auth, authPass, socket, server, ["canEditRanks"], user);
    if (!acc) return;
    if (acc.above.server[server].ranks.some(r => r === rank)) return;
    db.collection("accounts").updateOne(
      {"name": user},
      {$push: {["server." + server + ".ranks"] : rank}}
    );
  });
  socket.on("revokeRank", async function(user, rank, auth, authPass, socket, server) {
    acc = await validateRequest(auth, authPass, socket, server, ["canEditRanks"], user);
    if (!acc) return;
    db.collection("accounts").updateOne(
      {"name": user},
      {$pull: {["server." + server + ".ranks"]: rank}}
    );
  });
  socket.on("stream", function(name, stream) {
    io.emit("streamFeed", name, stream);
  });
  socket.on("updateAvatar", async function(data, name, pass, socket) {
    try {
      data = data.split(';base64,')[1];
    } catch (e) {console.log("sent bad data"); /*someone sent bad data*/}
    acc = await validateRequest(name, pass, socket);
    if (!acc) return;
    fs.writeFile(__dirname + "/assets/user/" + name + ".png", data, {encoding: 'base64'}, function(err) {
      if (err) throw err;
    });
  });
  socket.on("verifyEmail", async function(name, key, socket) {
    if (!io.sockets.connected[socket]) return;
    acc = await getUser(name);
    if (!acc) {
      io.sockets.connected[socket].emit("verifyFailure", 0);
      return;
    }
    if (acc.verify) {
      io.sockets.connected[socket].emit("verifySuccess");
      return;
    }
    if (acc.verifyKey !== key) {
      io.sockets.connected[socket].emit("verifyFailure", 0);
      return;
    }
    if (new Date().getTime() > acc.verifyExpiry) {
      io.sockets.connected[socket].emit("verifyFailure", 1);
      return;
    }
    io.sockets.connected[socket].emit("verifySuccess");
    db.collection("accounts").updateOne(
      {"name" : name},
      {
        $set: {"verify" : true},
        $unset: {verifyKey: "", verifyExpiry: ""}
      }
    );
  });
  socket.on("updateMailLists", async function(user, pass, socket, getNews, getMarketing) {
    acc = await validateRequest(user, pass, socket);
    if (!acc) return;
    db.collection("accounts").updateOne(
      {"name": user},
      {$set: {"mailLists": [getNews, getMarketing]}}
    );
  });
  socket.on("resetPassword", async function(email, socket) {
    if (!io.sockets.connected[socket]) return;
    acc = await db.collection("accounts").find(
      {"email": email}, 
      {projection: {_id: 0, name: 1}}
    ).toArray();
    acc = acc[0]
    if (acc) {
      key = crypto.randomBytes(16).toString("hex");
      //86400000ms = 24 hours
      db.collection("accounts").updateOne(
        {"name" : acc.name},
        {$set: {
          "passResetKey": key, 
          "passResetExpires": new Date().getTime() + 86400000}}
      );
      let subResetEmail = passwordResetTemp;
      subResetEmail = subResetEmail.replace(/\$NAME/g, acc.name);
      subResetEmail = subResetEmail.replace(/\$KEY/g, key);
      subResetEmail = subResetEmail.replace(/\$EMAIL/g, emailId);
      nmclient.sendMail({
        from: process.env.user,
        to: email,
        subject: "Password Reset on Unnamed Chat",
        html: subResetEmail,
      }, function(err, info) {
        if (err) console.log(err);
        console.log("Password reset email sent: " + info.response);
      });
      emailId++;
      fs.writeFile(__dirname + "/data/emailId.txt", emailId, function(err) {
        if (err) throw err;
      });
    }
  });
  socket.on("recoverPassword", async function(name, key, pass, socket) {
    if (!io.sockets.connected[socket]) return;
    if (pass.length < 6 || pass.length >= 30) return;
    acc = await getUser(name);
    if (!acc) {
      io.sockets.connected[socket].emit("passRecoverFailure", 0);
      return;
    }
    if (acc.passResetKey !== key) {
      io.sockets.connected[socket].emit("passRecoverFailure", 0);
      return;
    }
    if (new Date().getTime() > acc.passResetExpires) {
      io.sockets.connected[socket].emit("passRecoverFailure", 1);
      return;
    }
    io.sockets.connected[socket].emit("passRecoverSuccess");
    bcrypt.genSalt(10, function(err, salt) {
      if (err) throw err;
        bcrypt.hash(pass, salt, function(err, hash) {
          if (err) throw err;
          db.collection("accounts").updateOne(
            {"name" : name},
            {
              $set: {"pass": hash},
              $unset: {passResetExpires: "", passResetKey: ""}
            }
          );
        });
      });
  });
  socket.on("getInviteLink", async function(name, pass, socket, server, expiry, maxUses) {
    acc = await validateRequest(name, pass, socket, []);
    if (!acc) return;
    if (maxUses === "Infinity") maxUses = Infinity;
    if (expiry < new Date().getTime() || maxUses < 1) return;
    if (expiry > 8640000000000000) expiry = 8640000000000000;
    let key = server + "-" + crypto.randomBytes(6).toString("base64").replace("/", "!");
    db.collection("invites").insertOne({
        key: key,
        expiry: expiry,
        usesLeft: maxUses
      });
    io.sockets.connected[socket].emit("inviteLink", key);
  }); 
  socket.on("confirmJoin", async function(name, pass, socket, link) {
    let acc = await validateRequest(name, pass, socket);
    if (!acc) return;
    let valid = await db.collection("invites").find({key: link}, {projection:{_id: 0}}).toArray();
    if (!valid[0]) {
      io.sockets.connected[socket].emit("linkResponse", false, null);
      return;
    }
    if (valid[0].expiry < new Date().getTime()) {
      db.collection("invites").remove(
        {key: link}
      );
      io.sockets.connected[socket].emit("linkResponse", false, null);
      return;
    }
    let server = parseInt(link.split("-")[0]);
    if (Object.keys(acc.server).indexOf(server) !== -1) {
      io.sockets.connected[socket].emit("linkResponse", true, null);
      return;
    }
    try {
    io.sockets.connected[socket].emit("linkResponse", true, server);
    } catch (e) {/*user redirected already*/}
    db.collection("accounts").updateOne(
      {name: name},
      {$set: {["server." + server]: {
        ranks: [],
        mute: 0
        //insert more server properties here
      }}}
    );
    if (valid[0].usesLeft-1 === 0) {
      db.collection("invites").remove(
        {key: link}
      );
    } else {
      db.collection("invites").updateOne(
        {key: link},
        {$set: {usesLeft: valid[0].usesLeft-1}}
      );
    }
  });
  socket.on("showServer", async function(name, pass, socket, server) {
    acc = await validateRequest(name, pass, socket);
    if (!acc) return;
    io.sockets.connected[socket].leave(Object.keys(io.sockets.connected[socket].adapter.rooms).find(item => item.slice(0,6) === "<room>"));
    io.sockets.connected[socket].join("<room>" + server);
    let serverRes = await db.collection("servers").find(
      {"id": parseInt(server)}, 
      {projection: {_id: 0, msgLog: 1, name: 1, id: 1}}
    ).toArray();
    io.sockets.connected[socket].emit("serverData", serverRes[0].msgLog, acc.server[server].mute, serverRes[0].name, serverRes[0].id);
  });
  socket.on("createServer", async function (name, pass, socket, serverName, icon) {
    acc = await validateRequest(name, pass, socket);
    if (!acc) return;
    db.collection("servers").insertOne({
      name: serverName,
      id: nextServerId,
      ranks: [],
      msgLog: []
    });
    try {
      icon = icon.split(';base64,');
    } catch(e) {
      icon = "";
    }
    if (icon[1]) {
      fs.writeFile(__dirname + "/assets/server/" + nextServerId + ".png", icon, {encoding: 'base64'}, function(err) {
        if (err) throw err;
      });
    }
    db.collection("accounts").updateOne(
      {name: name},
      {$set: {["server." + nextServerId]: {
        ranks: [],
        mute: 0,
        owner: true
        //insert more server properties here
      }}}
    );
    io.sockets.connected[socket].emit("serverCreated", serverName, nextServerId, [], [], [{name: name, ranks: []}]);
    nextServerId++;
    db.collection("id").updateOne(
      {main: true},
      {$set: {servers: nextServerId}}
    );
  });
});
/*
function moderate() {
  //moderation
  let bannedWords = ["nigg", "niga", "nigro", "fag"];
  var currentActions = 0;
  bannedWords.forEach(word => {
    if (msg.toLowerCase().indexOf(word) !== -1) {
      acc.modHistory.forEach(action => {
        if (action.type === "warn" && action.expires > new Date().getTime()) {
          currentActions++;
        }
      });
      if (currentActions >= 2) {
      io.emit("muteMsg", name, "ModerationBot", [0,30,0,0], "3rd Warning");
      msgLog.push(["mute", name, "ModerationBot", [0,30,0,0], "3rd Warning"]);
      db.collection("accounts").updateOne(
        {"name" : name},
        {
          $set: {"mute" : new Date().getTime() + 2592000000}, 
          $push: {"modHistory": {type: "mute", by: "ModerationBot", expires: new Date().getTime() + 2592000000, reason: "3rd Warning"}}
        }
      );
      } else {
        io.emit("warnMsg", name, "ModerationBot", [0,30,0,0], "Inappropriate language");
        msgLog.push(["warn", name, "ModerationBot", [0,30,0,0], "Inappropriate language"]);
        db.collection("accounts").updateOne(
          {"name": name},
          {$push: {"modHistory": {type: "warn", by: "ModerationBot", expires: new Date().getTime() + 2592000000, reason: "Inappropriate language"}}}
        );
      }
    }
  });
}
*/
//LOADING
//load logo into mem
fs.readFile(__dirname + "/assets/logo.png", function(err, data) {
  if (err) throw err;
  logo = data;
});
//load ranks into mem
/*
fs.readFile(__dirname + "/data/ranks", function(err, data) {
  if (err) {
    ranks = [];
  } else {
    ranks = JSON.parse(data.toString());
    //get rank id count
    ranks.forEach(r => {if (r.id+1 > idCount) idCount = r.id+1});
  }
});
*/
//load chat into mem
fs.readFile(__dirname + "/data/msglog", function(err, data) {
  if (err) {
    msgLog = [];
  } else {
    msgLog = JSON.parse(data.toString());
  }
});
//emailId
fs.readFile(__dirname + "/data/emailId.txt", function(err, data) {
  if (err) throw err
  emailId = parseInt(data.toString());
});
//load email text
fs.readFile(__dirname + "/assets/emailTemplates/verify.html", function(err, data) {
  if (err) throw err
  verEmail = data.toString().split("<script>")[0];
});
fs.readFile(__dirname + "/assets/emailTemplates/news.html", function(err, data) {
  if (err) throw err
  newsEmail = data.toString().split("<script>")[0];
});
fs.readFile(__dirname + "/assets/emailTemplates/passwordReset.html", function(err, data) {
  if (err) throw err
  passwordResetTemp = data.toString().split("<script>")[0];
});
//  DEV  //
async function sendNewsletter() {
  let emails = await db.collection("accounts").find({}, {projection:{_id: 0}}).toArray();
  //let emails = await db.collection("accounts").find({"name": "admin"}, {projection:{_id: 0}}).toArray();
  for (i=0; i<emails.length; i++) {
    if (!emails[i].mailLists[0]) continue;
    subNewsEmail = newsEmail;
    subNewsEmail = subNewsEmail.replace(/\$NAME/g, emails[i].name);
    subNewsEmail = subNewsEmail.replace(/\$EMAIL/g, emailId);
    nmclient.sendMail({
      from: process.env.user,
      to: emails[i].email,
      subject: "Unnamed Chat Newsletter",
      html: subNewsEmail,
    }, function(err, info) {
      if (err) console.log(err);
      console.log("Success: sent to " + info.accepted[0] + " with response " + info.response);
    });
    console.log("Newsletter attempted to send to " + emails[i].name);
    emailId++;
    fs.writeFile(__dirname + "/data/emailId.txt", emailId, function(err) {
        if (err) throw err;
    });
  }
}
async function updateDB(prop, val, noOverwrite) {
  let accs = await db.collection("accounts").find({}, {projection:{_id: 0}}).toArray();
  for (i=0; i<accs.length; i++) {
    if (!noOverwrite || !accs[i][prop]) {
      db.collection("accounts").updateOne(
          {"name": accs[i].name},
          {$set: {[prop]: val}}
          //{$unset: {[prop]: ""}}
      );
      console.log(accs[i].name + " was written to");
    } else {
      console.log(accs[i].name + " wasn't written to (won't overwrite)");
    }
  } 
}
//       //
//start server
http.listen(8080, function() {
  console.clear();
  console.log("Starting on port 8080");
});