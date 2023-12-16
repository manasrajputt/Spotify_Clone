var express = require('express');
var router = express.Router();
const passport = require('passport');
const userModel = require('../models/userModel');
const songModel = require('../models/songModel');
const playlistModel = require('../models/playlistModel');
const mongoose = require('mongoose');
const multer = require('multer');
const id3 = require('node-id3');
const { Readable } = require('stream');
const crypto = require('crypto');
require('dotenv').config();

mongoose.connect('mongodb+srv://manasrajput7470:korludag123@cluster0.mln49bw.mongodb.net/Music_App?retryWrites=true&w=majority').then(() => {
  console.log("db connected");
}).catch(err => {
  console.log(err);
})

const localStrategy = require('passport-local')
passport.use(new localStrategy(userModel.authenticate()));

/* GET home page. */
router.get('/', isLoggedIn, async function (req, res, next) {
  const currentUser = await userModel.findOne({
    _id: req.user._id
  })
    .populate({
      path: 'playlist',
      populate: {
        path: 'songs',
        model: 'song'
      }
    })

  res.render('index', { currentUser });
});

router.get('/auth', function (req, res, next) {
  res.render("register");
})

router.get('/uploadMusic', isLoggedIn, isAdmin, function (req, res, next) {
  res.render("uploadMusic");
})

const conn = mongoose.connection

var gfsBucket, gfsBucketPoster;

conn.once('open', () => {
  gfsBucket = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: 'audio'
  })

  gfsBucketPoster = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: 'poster'
  })
})

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

router.post('/uploadmusic', isLoggedIn, isAdmin, upload.array('song'), async function (req, res, next) {

  await Promise.all(req.files.map(async (file) => {

    const rdmName = crypto.randomBytes(20).toString('hex');

    // console.log(id3.read(req.file.buffer));
    var songData = id3.read(file.buffer);

    Readable.from(file.buffer).pipe(gfsBucket.openUploadStream(rdmName))

    Readable.from(songData.image.imageBuffer).pipe(gfsBucketPoster.openUploadStream(rdmName + 'poster'))

    await songModel.create({
      title: songData.title,
      artist: songData.artist,  
      album: songData.album,
      size: file.size,
      poster: rdmName + 'poster',
      fileName: rdmName
    })
  }))
  res.send('uploaded');
})

router.get('/poster/:posterName', function (req, res, next) {
  console.log(req.params.posterName)
  gfsBucketPoster.openDownloadStreamByName(req.params.posterName).pipe(res)
})

/* user authentication routes */

router.post('/register', async function (req, res, next) {

  var newUser = new userModel({
    username: req.body.username,
    email: req.body.email
  })
  userModel.register(newUser, req.body.password)
    .then(function (usercreated) {
      passport.authenticate('local')(req, res, async function () {

        const songs = await songModel.find({})
        const defaultplayList = await playlistModel.create({
          name: req.body.username,
          owner: req.user._id,
          songs: songs.map(song => song._id)
        })

        const newUser = await userModel.findOne({
          _id: req.user._id
        })

        newUser.playlist.push(defaultplayList._id)
        await newUser.save();
        res.redirect('/');
      })
    })
    .catch(function (e) {
      res.send(e);
    })
})

router.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login'
}), function (req, res, next) { });

router.get('/logout', function (req, res, next) {
  if (req.isAuthenticated())
    req.logout(function (err) {
      if (err) { return next(err); }
      else res.redirect('/auth');
    })
  else {
    res.redirect('/');
  }
})


function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  else {
    res.redirect('/auth')
  }
}

function isAdmin(req, res, next) {
  if (req.user.isAdmin) {
    return next();
  }
  else {
    res.redirect('/')
  }
}

/* user authentication routes */

router.get('/stream/:musicName', isLoggedIn, async function (req, res, next) {

  const currentSong = await songModel.findOne({
    fileName: req.params.musicName
  })

  const stream = gfsBucket.openDownloadStreamByName(req.params.musicName)

  res.set('Content-Type', 'audio/mpeg')
  res.set('Content-Length', currentSong.size + 1)
  res.set('Content-Range', `bytes 0-${currentSong.size - 1}/${currentSong.size}`)
  res.set('Content-Ranges', 'byte')
  res.status(206)

  stream.pipe(res)
})

router.get('/SongName/:musicName', isLoggedIn, async function (req, res, next) {

  const currentSong = await songModel.findOne({
    fileName: req.params.musicName
  })

  res.json({
    title: currentSong.title
  })
})

router.post('/search', isLoggedIn, async (req, res, next) => {
  const searhedMusic = await songModel.find({
    title: { $regex: req.body.search }
  })

  res.json({
    songs: searhedMusic
  })

})

router.get('/likeMusic/:songid', isLoggedIn, isLoggedIn, async function (req, res, next) {
  const foundUser = await userModel.findOne({ username: req.session.passport.user })
  if (foundUser.likes.indexOf(req.params.songid) === -1) {
    foundUser.likes.push(req.params.songid);
  }
  else {
    foundUser.likes.splice(foundUser.likes.indexOf(req.params.songid), 1)
  }
  await foundUser.save();

  const foundSong = await songModel.findOne({ _id: req.params.songid })
  // console.log(foundSong)
  if (foundSong.likes.indexOf(foundUser._id) === -1) {
    foundSong.likes.push(foundUser._id);
  }
  else {
    foundSong.likes.splice(foundSong.likes.indexOf(foundUser._id), 1)
  }
  await foundSong.save();
  res.redirect('back');
  // console.log(foundUser)
})

router.get('/likedMusic', isLoggedIn, async function (req, res, next) {
  const songData = await userModel.findOne({ username: req.session.passport.user })
    .populate("likes")
  // console.log(songData);
  res.render("likedMusic", { songData });
})

router.post("/createplaylist", isLoggedIn, async function (req, res, next) {
  const defaultplayList = await playlistModel.create({
    name: req.body.playlistName,
    owner: req.user._id,
  })

  const newUser = await userModel.findOne({
    _id: req.user._id
  })

  newUser.playlist.push(defaultplayList._id)
  await newUser.save();
  res.redirect('/');
})

router.get('/deleteplaylist/:playlistid', isLoggedIn, async function (req, res, next) {
  const foundUser = await userModel.findOne({ username: req.session.passport.user })
  console.log(foundUser)
  foundUser.playlist.splice(foundUser.playlist.indexOf(req.params.playlistid), 1);

  await foundUser.save()

  const playlist = await playlistModel.findOneAndDelete({ _id: req.params.playlistid })
  console.log(foundUser);
  res.redirect("/");
})

router.get('/AddPlayList/:playlistid/:songid', isLoggedIn, async function (req, res, next) {
  const foundPlayList = await playlistModel.findOne({ _id: req.params.playlistid })
  foundPlayList.songs.push(req.params.songid);
  await foundPlayList.save();
  res.redirect("/");
})

router.get('/PlayList/:playlistid', isLoggedIn, async function (req, res, next) {
  const userdata = req.user;
  const foundPlayList = await playlistModel.findOne({ _id: req.params.playlistid })
    .populate("songs");
  res.render("playList", { foundPlayList, userdata })
})

router.get('/removesong/:playlistid/:songid', isLoggedIn, async function (req, res, next) {
  const playlistData = await playlistModel.findOne({ _id: req.params.playlistid })
  console.log(playlistData);
  playlistData.songs.splice(playlistData.songs.indexOf(req.params.songid), 1);

  await playlistData.save();

  res.redirect("back");
})

module.exports = router;