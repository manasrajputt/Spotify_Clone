const mongoose = require('mongoose');
const passport = require('passport');
const plm=require('passport-local-mongoose');

const userSchema = mongoose.Schema({
    username: String,
    email: String,
    contact: String,
    playlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'playlist'
    }],
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'song'
    }],
    profileimage: {
        type: String,
        default: '/images/def.png'
    },
    isAdmin: {
        type: Boolean,
        default: false
    }
})

userSchema.plugin(plm);

module.exports = mongoose.model('user', userSchema);

