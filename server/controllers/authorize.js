/* eslint-disable no-console */
const crypto = require('crypto')
const express = require('express')
const router = express.Router()
const oauth = require('oauth')

const {
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  TWITTER_CALLBACK_URL,
  GITHUB_CLIEND_ID,
  GITHUB_CLIENT_SECRET,
  GITHUB_CALLBACK_URL
} = process.env
const providers = ['github', 'twitter']

// twitter uses OAuth1
const twitter = new oauth.OAuth(
  'https://twitter.com/oauth/request_token',
  'https://twitter.com/oauth/access_token',
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  '1.0A',
  TWITTER_CALLBACK_URL,
  'HMAC-SHA1'
)

// github uses OAuth2
const github = new oauth.OAuth2(
  GITHUB_CLIEND_ID,
  GITHUB_CLIENT_SECRET,
  'https://github.com/',
  'login/oauth/authorize',
  'login/oauth/access_token'
)

function validateProvider(req, res, next) {
  const { provider } = req.params
  if (!providers.includes(provider)) {
    res.status(404).send('Wrong provider')
  } else {
    next()
  }
}

router.get('/connect/:provider', validateProvider, (req, res) => {
  const { provider } = req.params

  if (provider === 'github') {
    const CSRFToken = crypto.randomBytes(32).toString('hex')
    const authorizeUrl = github.getAuthorizeUrl({
      redirect_uri: GITHUB_CALLBACK_URL,
      scope: [], // 'gist' - https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
      state: CSRFToken
    })
    req.session.CSRFToken = CSRFToken
    res.redirect(authorizeUrl)
  } else if (provider === 'twitter') {
    twitter.getOAuthRequestToken(function(error, oauthToken, oauthTokenSecret) {
      if (error) {
        res.status(500).send(error)
      } else {
        req.session.oauthRequestToken = oauthToken
        req.session.oauthRequestTokenSecret = oauthTokenSecret
        res.redirect(
          'https://twitter.com/oauth/authorize?oauth_token=' + req.session.oauthRequestToken
        )
      }
    })
  }
})

router.get('/oauth_callback/:provider', validateProvider, (req, res) => {
  const { provider } = req.params

  if (provider === 'github') {
    const { code, state } = req.query
    if (state !== req.session.CSRFToken) {
      res.status(404).send('Malformed request')
      return
    }
    github.getOAuthAccessToken(code, {}, function(error, accessToken, refreshToken, results) {
      if (error || results.error) {
        console.error('getOAuthAccessToken error', error || results.error)
        res.status(500).send(error || results.error)
      } else {
        req.session.refreshToken = refreshToken
        req.session.accessToken = accessToken
        res.redirect('/make-contribution')
      }
    })
  } else if (provider === 'twitter') {
    twitter.getOAuthAccessToken(
      req.query.oauth_token,
      req.session.oauthRequestTokenSecret,
      req.query.oauth_verifier,
      (error, oauthAccessToken, oauthAccessTokenSecret) => {
        if (error) {
          console.error('getOAuthAccessToken error', error)
          res.status(500).send(error)
        } else {
          req.session.oauthAccessToken = oauthAccessToken
          req.session.oauthAccessTokenSecret = oauthAccessTokenSecret
          res.redirect('/make-contribution')
        }
      }
    )
  }
})

router.get('/user_data/', (req, res) => {
  let userData = { name: 'Anonymous' }
  if (req.session.accessToken) {
    github.get('https://api.github.com/user', req.session.accessToken, function(error, data) {
      if (!error) {
        userData = JSON.parse(data)
        userData.handle = userData.login
        userData.socialType = 'github'
        req.session.handle = userData.login
        req.session.socialType = 'github'
      }
      res.json(userData)
    })
  } else if (req.session.oauthAccessToken && req.session.oauthAccessTokenSecret) {
    twitter.get(
      'https://api.twitter.com/1.1/account/verify_credentials.json',
      req.session.oauthAccessToken,
      req.session.oauthAccessTokenSecret,
      function(error, data) {
        if (!error) {
          userData = JSON.parse(data)
          userData.handle = userData.screen_name
          userData.socialType = 'twitter'
          req.session.handle = userData.screen_name
          req.session.socialType = 'twitter'
        }
        res.json(userData)
      }
    )
  } else {
    res.json(userData)
  }
})

router.get('/logout', (req, res) => {
  req.session.destroy()
})

module.exports = router
