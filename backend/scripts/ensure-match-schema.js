#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ensureMatchCallSchema } = require('../config/ensureMatchCallSchema');

ensureMatchCallSchema()
  .then(() => {
    console.log('match_calls schema OK');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
