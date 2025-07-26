const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();
console.log(process.env);

const { default: helmet } = require('helmet');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN,
    credentials: true,
  }),
);

app.use(
  session({
    proxy: process.env.NODE_ENV === 'production',
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      dbName: process.env.DB_NAME,
      collectionName: process.env.DB_SESSION_NAME,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 2 * 60 * 60 * 1000,
    },
  }),
);
// add CSP headers
app.use(
  helmet({
    // NOTE: Disabled for local development
    // enable this at the time of deployment

    // hosting server might overwrite these check
    // at the time of deployment
    contentSecurityPolicy: false,
    // TODO: Enable this at the time of deployment
    // contentSecurityPolicy: {
    //     directives: {
    //         defaultSrc: ["'self'"],
    //         styleSrc: ["'self'", 'https:', "'unsafe-inline'"], // Allow styles from same origin and from jsscribbler.net
    //         scriptSrc: ["'self'"], // Allowing scripts only from self and trusted CDNs
    //         objectSrc: ["'none'"],
    //         imgSrc: ["'self'", 'data:'],
    //         fontSrc: ["'self'"],
    //         frameSrc: ["'none'"],
    //         workerSrc: ["'none'"],
    //         frameAncestors: ["'none'"],
    //         baseUri: ["'self'"],
    //         formAction: ["'self'"],
    //         upgradeInsecureRequests: [],
    //     },
    // },
    frameguard: {
      action: 'sameorigin',
    },
    hsts: {
      maxAge: 63072000, // 2 years, for Strict-Transport-Security
      includeSubDomains: true,
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
  }),
);

module.exports = {
  app,
};
