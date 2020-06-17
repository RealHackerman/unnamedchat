const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const nm = require("nodemailer");
const crypto = require("crypto");
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
var msgLog = [];
var userRanks;
var onlineUsers = [];
var logo;
var f;
//mongo
var db;
const mdbClient = new MongoClient("mongodb+srv://" + process.env.mongoName + ":" + process.env.mongoPass + "@ucdb-cyla3.mongodb.net/test?retryWrites=true&w=majority", {useNewUrlParser: true, useUnifiedTopology: true});
mdbClient.connect(err => {
  if (err) {
    throw err;
  } else {
    console.log("Connected to database");
    db = mdbClient.db("main");
  }
});
//end mongo
const emailRegex = RegExp("^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$");
var ranks = [];
var idCount = 0;
//todo: implement log saving
var log = [];
var g;
app.get("/", function(req, res) {
  res.sendFile(__dirname + "/login.html");
});
app.get("*", function(req, res) {
  if (false) {
    //able to send 503 if needed
    res.status(503);
    res.sendFile(__dirname + "/503.html");
  }
  if (req.originalUrl === "/.env") {
    res.status(403);
    res.sendFile(__dirname + "/403.html");
    return;
  }
  let newReq = req.originalUrl.split("?")[0].replace("%20", " ");
  if (!fs.existsSync(__dirname + newReq)) newReq += ".html";
  if (!fs.existsSync(__dirname + newReq)) {
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
function getUserRanks(user) {
  userRanks = [];
  for (i=0; i<user.ranks.length; i++) {
    userRanks.push(getRankById(user.ranks[i]));
  }
  return userRanks;
}
function getRankById(id) {
  for (f=0; f<ranks.length; f++) {
    if (ranks[f].id === id) {
      return ranks[f];
    }
  }
}
function getRankPosById(id) {
  for (f=0; f<ranks.length; f++) {
    if (ranks[f].id === id) {
      return f;
    }
  }
}
function hasPerm(user, perm) {
  for (i=0; i<ranks.length; i++) {
    if (user.ranks.some(id => id === ranks[i].id) && ranks[i][perm]) {
      return true;
    }
  }
  return false;
}
function rankLevel(userData) {
  bestRank = Infinity;
  for (i=0; i<userData.ranks.length; i++) {
    if (getRankById(userData.ranks[i]).level < bestRank) {
      bestRank = getRankById(userData.ranks[i]).level;
    }
  }
  return bestRank;
}
async function getUserList() {
  let res = await db.collection("accounts").find({}, {projection:{_id: 0}}).toArray();
  allUserRanks = [];
  for (g = 0; g<res.length; g++) {
    allUserRanks.push({name: res[g].name, ranks: getUserRanks(res[g])});
  }
  return allUserRanks;
}
async function getUser(user) {
  let res = await db.collection("accounts").find({"name": user}, {projection:{_id: 0}}).toArray();
  return res[0];
}
async function validateRequest(name, pass, socket, requiredPerms, aboveRank) {
  if (!io.sockets.connected[socket]) return false;
  acc = await getUser(name);
  //validation
  if (!acc || pass !== acc.pass) {
    io.sockets.connected[socket].emit("accountSyncError");
    log.push("pass crack attempt:" + new Date().getTime());
    return false;
  }
  if (!requiredPerms) return acc;
  if (acc.name === "admin") {
    if (!aboveRank) return acc;
    accAbove = await getUser(aboveRank);
    return [acc, accAbove];
  }
  for (i=0; i<requiredPerms.length; i++) {
    if (!hasPerm(acc, requiredPerms[i])) return false;
  }
  if (!aboveRank) return acc;
  accAbove = await getUser(aboveRank);
  if (!accAbove || rankLevel(acc) >= rankLevel(accAbove))return false;
  return [acc, accAbove];
}
//conection
io.on("connection", function(socket) {
  socket.on("chatConnect", async function(name, pass, socket) {
  acc = await validateRequest(name, pass, socket);
  if (!acc) return;
  allUsers = await getUserList(name);
  if (onlineUsers.every(user => user !== name)) {
    onlineUsers.push(name);
  }
  io.sockets.connected[socket].emit("firstConnect", msgLog, onlineUsers, acc.mute, acc.verify, acc.mailLists, allUsers);
  io.emit("newOnlineUser", name);
  });
  socket.on("disconnectInfo", async function(name, pass) {
    acc = await validateRequest(name, pass, socket);
    if (!acc) return;
    onlineUsers.splice(onlineUsers.indexOf(name), 1);
  });
  //message
  socket.on("msg", async function(msg, name, pass, socket, time) {
    acc = await validateRequest(name, pass, socket);
    if (acc && acc.mute < new Date().getTime()) {
      io.emit("msg", name, escapeHtml(msg), time);
      msgLog.push(["msg", name, escapeHtml(msg), time]);
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
      fs.writeFile(__dirname + "/data/msglog", JSON.stringify(msgLog), function(err) {
        if (err) throw err;
      });
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
        db.collection("accounts").insertOne({
          name: name,
          pass: pass,
          mute: 0,
          ranks: [],
          email: email,
          mailLists: [true, true],
          verify: false,
          verifyKey: key,
          //expires in 24 hours
          verifyExpiry: new Date().getTime() + 86400000,
          modHistory: []
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
  socket.on("mute", async function(user, time, duration, auth, authPass, socket, reason) {
    acc = await validateRequest(auth, authPass, socket, ["canMute"], user);
    if (!acc) return;
    io.emit("muteMsg", user, auth, duration, reason, time);
    msgLog.push(["mute", user, auth, duration, reason]);
    fs.writeFile(__dirname + "/data/msglog", JSON.stringify(msgLog), function(err) {
      if (err) throw err;
    });
    io.sockets.connected[socket].emit("muteSuccess","User muted succesfully");
    db.collection("accounts").updateOne(
      {"name" : user},
      {$set: {"mute" : time}}
    );
  });
  //create rank
  socket.on("createRank", async function(name, pass, socket) {
    acc = await validateRequest(name, pass, socket, ["canEditRanks"]);
    if (!acc) return;
    ranks.push({name: "New Rank", id: idCount, level: idCount, color: "white"});
    idCount++;
    fs.writeFile(__dirname + "/data/ranks", JSON.stringify(ranks), function(err) {
      if (err) throw err;
    });
    io.sockets.connected[socket].emit("ranks", ranks);
  });
  socket.on("editRank", async function(name, pass, socket, rankId, rankData) {
    acc = await validateRequest(name, pass, socket, ["canEditRanks"]);
    if (!acc) return;
    rankNumber = getRankPosById(rankId);
    if (rankData.name.length === 0) {
      rankData.name = ranks[rankNumber].name;
    }
    rankData.name = escapeHtml(rankData.name);
    rankData.id = ranks[rankNumber].id;
    //  !IMPORTANT! 
    //  remove when rank re-ordering implemented:
    //  rankData.level = ranks[rankNumber].level;
    //  !IMPORTANT!
    rankData.level = ranks[rankNumber].level;
    ranks[rankNumber] = rankData;
    fs.writeFile(__dirname + "/data/ranks", JSON.stringify(ranks), function(err) {
      if (err) throw err;
    });
    io.sockets.connected[socket].emit("ranks", ranks);
  });
  socket.on("queryRanks", function(socket) {
    if (!socket) return;
    io.sockets.connected[socket].emit("ranks", ranks);
  });
  socket.on("queryUserList", async function(socket) {
    if (!io.sockets.connected[socket]) return;
    let res = await db.collection("accounts").find({}, {projection:{_id: 0}}).toArray();
    allUserRanks = [];
    let names = [];
    for (g = 0; g<res.length; g++) {
      allUserRanks.push(getUserRanks(res[g]));
      names.push(res[g].name);
    }
    io.sockets.connected[socket].emit("allAccounts", names, allUserRanks);
  });
  //add rank to user
  socket.on("addRank", async function(user, rank, auth, authPass, socket) {
    acc = await validateRequest(auth, authPass, socket, ["canEditRanks"], user);
    if (!acc) return;
    for (i=0; i<ranks.length; i++) {
      if (ranks[i].id === rank && acc[1].ranks.every(id => id !== ranks[i].id)) {
        db.collection("accounts").updateOne(
          {"name": user},
          {$push: {"ranks" : ranks[i].id}}
        );
        break;
      }
    }
  });
  socket.on("revokeRank", async function(user, rank, auth, authPass, socket) {
    acc = await validateRequest(auth, authPass, socket, ["canEditRanks"], user);
    if (!acc) return;
    db.collection("accounts").updateOne(
      {"name": user},
      {$pull: {"ranks": rank}}
    );
  });
  socket.on("stream", function(name, stream) {
    io.emit("streamFeed", name, stream);
  });
  socket.on("updateAvatar", async function(data, name, pass, socket) {
    try {
      data = data.split(';base64,')[1];
    } catch (e) {/*someone sent bad data*/}
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
    if (new Date().getTime() > acc.verifyExpiry) {
      io.sockets.connected[socket].emit("passRecoverFailure", 1);
      return;
    }
    io.sockets.connected[socket].emit("passRecoverSuccess");
    db.collection("accounts").updateOne(
      {"name" : name},
      {
        $set: {"pass": pass},
        $unset: {passResetExpires: "", passResetKey: ""}
      }
    );
  });
});
//LOADING
//load logo into mem
fs.readFile(__dirname + "/assets/logo.png", function(err, data) {
  if (err) throw err;
  logo = data;
});
//load ranks into mem
fs.readFile(__dirname + "/data/ranks", function(err, data) {
  if (err) {
    ranks = [];
  } else {
    ranks = JSON.parse(data.toString());
    //get rank id count
    ranks.forEach(r => {if (r.id+1 > idCount) idCount = r.id+1});
  }
});
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
      console.log("Success: " + info.response);
    });
    console.log("Newsletter sent to " + emails[i].name);
    emailId++;
    fs.writeFile(__dirname + "/data/emailId.txt", emailId, function(err) {
        if (err) throw err;
    });
  }
}
//       //
//start server
http.listen(8080, function() {
  console.clear();
  console.log("Starting on port 8080");
});